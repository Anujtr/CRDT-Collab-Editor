import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionState } from '../types';
import { useAuth } from './useAuth';
import { toast } from 'react-hot-toast';

interface ConnectionOptions {
  autoConnect?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  externalStatusUpdates?: boolean; // Allow external systems to control status
}

const DEFAULT_OPTIONS: ConnectionOptions = {
  autoConnect: false, // Disable auto-connect to prevent immediate connection attempts
  maxRetries: 5,
  retryDelay: 1000,
  externalStatusUpdates: false,
};

export function useConnection(options: ConnectionOptions = DEFAULT_OPTIONS) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    retryCount: 0,
  });
  
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  
  // Get WebSocket URL from environment or default to localhost
  const getSocketUrl = useCallback(() => {
    // Use WS_URL if available, otherwise derive from API_URL by removing /api suffix
    const wsUrl = process.env.REACT_APP_WS_URL;
    if (wsUrl) {
      return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    }
    
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
    // Remove /api suffix if present to get base server URL
    return apiUrl.replace(/\/api$/, '');
  }, []);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const updateConnectionState = useCallback((updates: Partial<ConnectionState>) => {
    setConnectionState(prev => ({ ...prev, ...updates }));
  }, []);

  // Allow external systems to update connection state
  const setExternalConnectionState = useCallback((updates: Partial<ConnectionState>) => {
    if (options.externalStatusUpdates) {
      updateConnectionState(updates);
    }
  }, [options.externalStatusUpdates, updateConnectionState]);

  const connect = useCallback(async () => {
    // Skip connection if using external status updates
    if (options.externalStatusUpdates) {
      console.log('useConnection: Skipping connect - using external status updates');
      return;
    }

    if (isConnectingRef.current || !isAuthenticated || !token) {
      console.log('useConnection: Skipping connect:', {
        isConnecting: isConnectingRef.current,
        isAuthenticated,
        hasToken: !!token
      });
      return;
    }

    if (socketRef.current?.connected) {
      console.log('useConnection: Already connected');
      return;
    }

    isConnectingRef.current = true;
    updateConnectionState({ status: 'connecting' });

    try {
      const socketUrl = getSocketUrl();
      console.log('useConnection: Connecting to:', socketUrl);
      
      // Clean up existing socket if any
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
      
      // Create socket connection with improved configuration
      const socket = io(socketUrl, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        auth: {
          token
        },
        autoConnect: false,
        forceNew: true,
        timeout: 15000, // Increased timeout
        reconnection: false, // Disable auto-reconnection, we handle it manually
        upgrade: true,
        rememberUpgrade: true
      });

      socketRef.current = socket;

      // Connection event handlers
      socket.on('connect', () => {
        console.log('useConnection: Socket connected, authenticating...');
        isConnectingRef.current = false;
        clearRetryTimeout();
        
        updateConnectionState({
          status: 'connected',
          lastConnected: Date.now(),
          retryCount: 0,
          error: undefined,
          lastDisconnectReason: undefined,
          lastConnectError: undefined
        });
        
        // Authenticate immediately
        console.log('useConnection: Sending authenticate event');
        socket.emit('authenticate', { token });
      });

      socket.on('authenticated', (data) => {
        console.log('useConnection: Authentication successful', data);
        updateConnectionState({ 
          status: 'authenticated',
          authenticatedAt: Date.now()
        });
        
        // Only show success toast if we had previous connection issues
        if (connectionState.retryCount > 0 || connectionState.error) {
          toast.success('Reconnected to server');
        }
      });

      socket.on('auth-error', (error) => {
        console.error('useConnection: Authentication error:', error);
        
        const errorMessage = error.message || 'Authentication failed';
        
        updateConnectionState({
          status: 'disconnected',
          error: errorMessage,
          retryCount: 0 // Reset retry count on auth errors
        });
        
        // Show appropriate toast based on error code
        if (error.code === 'TOKEN_REQUIRED' || error.code === 'INVALID_TOKEN') {
          toast.error('Please log in again');
        } else if (error.code === 'USER_NOT_FOUND') {
          toast.error('Account not found. Please contact support.');
        } else {
          toast.error(`Authentication failed: ${errorMessage}`);
        }
        
        disconnect();
      });

      socket.on('disconnect', (reason) => {
        console.log('useConnection: Socket disconnected:', reason);
        isConnectingRef.current = false;
        
        const shouldReconnect = reason !== 'io client disconnect' && isAuthenticated;
        const errorMessage = reason === 'io server disconnect' ? 'Server disconnected' : 
                             reason === 'transport close' ? 'Connection lost' :
                             reason === 'transport error' ? 'Network error' :
                             `Disconnected: ${reason}`;
        
        updateConnectionState({
          status: 'disconnected',
          error: errorMessage,
          lastDisconnectReason: reason
        });
        
        // Auto-reconnect unless manually disconnected
        if (shouldReconnect) {
          console.log('useConnection: Scheduling auto-reconnect');
          // Small delay before scheduling reconnect to avoid immediate retry
          setTimeout(() => {
            scheduleReconnect();
          }, 1000);
        } else {
          console.log('useConnection: Not reconnecting due to reason:', reason);
        }
      });

      socket.on('connect_error', (error) => {
        console.error('useConnection: Connection error:', error);
        isConnectingRef.current = false;
        
        const errorMessage = error.message || 'Connection failed';
        console.log('useConnection: Connection error details:', {
          message: errorMessage,
          type: (error as any).type,
          description: (error as any).description
        });
        
        updateConnectionState({
          status: 'disconnected',
          error: errorMessage,
          lastConnectError: errorMessage
        });
        
        if (isAuthenticated) {
          console.log('useConnection: Scheduling reconnect after connection error');
          scheduleReconnect();
        }
      });

      socket.on('error', (error) => {
        updateConnectionState({
          error: error.message || 'Socket error'
        });
        toast.error(`Connection error: ${error.message}`);
      });

      // Add small delay before connecting to ensure backend is ready
      setTimeout(() => {
        console.log('useConnection: Starting connection to:', socketUrl);
        socket.connect();
      }, 200);

    } catch (error) {
      isConnectingRef.current = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateConnectionState({
        status: 'disconnected',
        error: errorMessage
      });
      
      if (isAuthenticated) {
        scheduleReconnect();
      }
    }
  }, [isAuthenticated, token, getSocketUrl, updateConnectionState, clearRetryTimeout]);

  const scheduleReconnect = useCallback(() => {
    const { maxRetries = 5, retryDelay = 1000 } = options;
    
    // Get current retry count from state to avoid stale closure
    setConnectionState(currentState => {
      if (currentState.retryCount >= maxRetries) {
        toast.error('Unable to connect to server. Please refresh the page.');
        return {
          ...currentState,
          status: 'disconnected',
          error: 'Max retry attempts reached'
        };
      }

      const newRetryCount = currentState.retryCount + 1;
      
      // Exponential backoff with maximum limit of 30 seconds
      const exponentialDelay = retryDelay * Math.pow(2, newRetryCount - 1);
      const delay = Math.min(exponentialDelay, 30000);
      
      console.log('useConnection: Scheduling reconnection attempt', {
        attempt: newRetryCount,
        maxRetries,
        delayMs: delay
      });
      
      clearRetryTimeout();
      retryTimeoutRef.current = setTimeout(() => {
        console.log(`useConnection: Reconnection attempt ${newRetryCount}/${maxRetries}`);
        connect();
      }, delay);
      
      return {
        ...currentState,
        retryCount: newRetryCount,
        status: 'disconnected',
        error: `Reconnecting... (attempt ${newRetryCount}/${maxRetries})`
      };
    });
  }, [options, clearRetryTimeout, connect]);

  const disconnect = useCallback(() => {
    console.log('useConnection: Manual disconnect requested');
    clearRetryTimeout();
    isConnectingRef.current = false;
    
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    updateConnectionState({
      status: 'disconnected',
      retryCount: 0,
      error: undefined,
      manualDisconnect: true
    });
  }, [clearRetryTimeout, updateConnectionState]);

  const send = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected && connectionState.status === 'authenticated') {
      socketRef.current.emit(event, data);
      return true;
    }
    return false;
  }, [connectionState.status]);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      // Return cleanup function
      return () => {
        if (socketRef.current) {
          socketRef.current.off(event, callback);
        }
      };
    }
    return () => {};
  }, []);

  const off = useCallback((event: string, callback?: (data: any) => void) => {
    if (socketRef.current) {
      if (callback) {
        socketRef.current.off(event, callback);
      } else {
        socketRef.current.removeAllListeners(event);
      }
    }
  }, []);

  // Auto-connect when authenticated and autoConnect is enabled
  useEffect(() => {
    if (!options.externalStatusUpdates && options.autoConnect && isAuthenticated && token && 
        connectionState.status === 'disconnected' && !connectionState.manualDisconnect) {
      console.log('useConnection: Auto-connecting');
      connect();
    }
  }, [isAuthenticated, token, options.autoConnect, options.externalStatusUpdates, connect, connectionState.status, connectionState.manualDisconnect]);

  // Disconnect when user logs out
  useEffect(() => {
    if (!isAuthenticated && socketRef.current) {
      console.log('useConnection: User logged out, disconnecting');
      disconnect();
    }
  }, [isAuthenticated, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('useConnection: Component unmounting, cleaning up');
      clearRetryTimeout();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
    };
  }, [clearRetryTimeout]);

  return {
    connectionState,
    connect,
    disconnect,
    send,
    on,
    off,
    setExternalConnectionState,
    isConnected: connectionState.status === 'connected' || connectionState.status === 'authenticated',
    isAuthenticated: connectionState.status === 'authenticated',
  };
}