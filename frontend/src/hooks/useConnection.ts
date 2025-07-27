import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionState } from '../types';
import { useAuth } from './useAuth';
import { toast } from 'react-hot-toast';

interface ConnectionOptions {
  autoConnect?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: ConnectionOptions = {
  autoConnect: false, // Disable auto-connect to prevent immediate connection attempts
  maxRetries: 5,
  retryDelay: 1000,
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

  const connect = useCallback(async () => {
    if (isConnectingRef.current || !isAuthenticated || !token) {
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    isConnectingRef.current = true;
    updateConnectionState({ status: 'connecting' });

    try {
      const socketUrl = getSocketUrl();
      
      // Create socket connection with retry logic
      const socket = io(socketUrl, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        auth: {
          token
        },
        autoConnect: false,
        forceNew: true,
        timeout: 10000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
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
          error: undefined
        });
        
        // Add small delay before authentication to ensure connection is stable
        setTimeout(() => {
          console.log('useConnection: Sending authenticate event');
          socket.emit('authenticate', { token });
        }, 100);
      });

      socket.on('authenticated', (data) => {
        updateConnectionState({ status: 'authenticated' });
        toast.success('Connected to server');
      });

      socket.on('auth-error', (error) => {
        updateConnectionState({
          status: 'disconnected',
          error: error.message || 'Authentication failed'
        });
        toast.error(`Authentication failed: ${error.message}`);
        disconnect();
      });

      socket.on('disconnect', (reason) => {
        console.log('useConnection: Socket disconnected:', reason);
        isConnectingRef.current = false;
        updateConnectionState({
          status: 'disconnected',
          error: reason === 'io server disconnect' ? 'Server disconnected' : undefined
        });
        
        // Auto-reconnect unless manually disconnected
        if (reason !== 'io client disconnect' && isAuthenticated) {
          scheduleReconnect();
        }
      });

      socket.on('connect_error', (error) => {
        console.error('useConnection: Connection error:', error);
        isConnectingRef.current = false;
        updateConnectionState({
          status: 'disconnected',
          error: error.message || 'Connection failed'
        });
        
        if (isAuthenticated) {
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
    
    if (connectionState.retryCount >= maxRetries) {
      updateConnectionState({
        status: 'disconnected',
        error: 'Max retry attempts reached'
      });
      toast.error('Unable to connect to server. Please refresh the page.');
      return;
    }

    const delay = retryDelay * Math.pow(2, connectionState.retryCount); // Exponential backoff
    
    clearRetryTimeout();
    retryTimeoutRef.current = setTimeout(() => {
      updateConnectionState({
        retryCount: connectionState.retryCount + 1
      });
      connect();
    }, delay);
  }, [options, connectionState.retryCount, updateConnectionState, clearRetryTimeout, connect]);

  const disconnect = useCallback(() => {
    clearRetryTimeout();
    isConnectingRef.current = false;
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    updateConnectionState({
      status: 'disconnected',
      retryCount: 0,
      error: undefined
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
    if (options.autoConnect && isAuthenticated && token && connectionState.status === 'disconnected') {
      connect();
    }
  }, [isAuthenticated, token, options.autoConnect, connect, connectionState.status]);

  // Disconnect when user logs out
  useEffect(() => {
    if (!isAuthenticated && socketRef.current) {
      disconnect();
    }
  }, [isAuthenticated, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    send,
    on,
    off,
    isConnected: connectionState.status === 'connected' || connectionState.status === 'authenticated',
    isAuthenticated: connectionState.status === 'authenticated',
  };
}