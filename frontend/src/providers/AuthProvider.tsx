import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { AuthState, User } from '../types';
import { authService } from '../services/auth/authService';
import { storage, getSessionId } from '../utils';
import { 
  TOKEN_STORAGE_KEY, 
  USER_STORAGE_KEY, 
  AUTH_SYNC_CHANNEL 
} from '../utils/constants';

interface AuthContextValue extends AuthState {
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateUser: (user: User) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'CLEAR_ERROR' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS':
      return {
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case 'AUTH_ERROR':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };

    case 'AUTH_LOGOUT':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };

    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const sessionId = useRef<string>(getSessionId());
  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  // Initialize authentication state on app load
  useEffect(() => {
    initializeAuth();
    setupCrossTabSync();
    
    // Register this session as active
    storage.registerActiveSession(sessionId.current);
    
    // Cleanup on unmount
    return () => {
      storage.unregisterActiveSession(sessionId.current);
      if (broadcastChannel.current) {
        broadcastChannel.current.close();
      }
    };
  }, []);

  const initializeAuth = async () => {
    try {
      // First check session-scoped storage for this tab
      const sessionToken = storage.getSessionScoped(TOKEN_STORAGE_KEY);
      const sessionUser = storage.getSessionScoped(USER_STORAGE_KEY);
      
      if (sessionToken && sessionUser) {
        // Verify session token is still valid
        const isValid = await authService.verifyToken(sessionToken);
        
        if (isValid) {
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: { user: sessionUser, token: sessionToken },
          });
          return;
        } else {
          // Session token is invalid, clear session data
          storage.removeSessionScoped(TOKEN_STORAGE_KEY);
          storage.removeSessionScoped(USER_STORAGE_KEY);
        }
      }
      
      // Fallback to global storage for backward compatibility
      const globalToken = storage.get(TOKEN_STORAGE_KEY);
      const globalUser = storage.get(USER_STORAGE_KEY);
      
      if (globalToken && globalUser) {
        // Verify global token is still valid
        const isValid = await authService.verifyToken(globalToken);
        
        if (isValid) {
          // Migrate to session-scoped storage
          storage.setSessionScoped(TOKEN_STORAGE_KEY, globalToken);
          storage.setSessionScoped(USER_STORAGE_KEY, globalUser);
          
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: { user: globalUser, token: globalToken },
          });
          return;
        } else {
          // Global token is invalid, clear global data
          storage.remove(TOKEN_STORAGE_KEY);
          storage.remove(USER_STORAGE_KEY);
        }
      }
      
      // No valid authentication found
      dispatch({ type: 'AUTH_LOGOUT' });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const login = useCallback(async (username: string, password: string, rememberMe: boolean = false) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.login(username, password);
      
      const { user, token } = response;

      // Store authentication data in session-scoped storage
      storage.setSessionScoped(TOKEN_STORAGE_KEY, token);
      storage.setSessionScoped(USER_STORAGE_KEY, user);

      if (rememberMe) {
        // Store remember me preference for auto-login
        storage.set('rememberMe', true);
      }
      
      // Notify other tabs about auth change
      notifyAuthChange('login', { user, token });

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error;
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.register(username, email, password);
      
      const { user, token } = response;

      // Store authentication data in session-scoped storage
      storage.setSessionScoped(TOKEN_STORAGE_KEY, token);
      storage.setSessionScoped(USER_STORAGE_KEY, user);
      
      // Notify other tabs about auth change
      notifyAuthChange('register', { user, token });

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout API to invalidate token on server
      if (state.token) {
        await authService.logout(state.token);
      }
    } catch (error) {
      console.error('Failed to logout on server:', error);
      // Continue with local logout even if server logout fails
    } finally {
      // Clear session-scoped storage
      storage.removeSessionScoped(TOKEN_STORAGE_KEY);
      storage.removeSessionScoped(USER_STORAGE_KEY);
      storage.remove('rememberMe');
      
      // Notify other tabs about logout
      notifyAuthChange('logout', null);

      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, [state.token]);

  const refreshToken = useCallback(async () => {
    if (!state.token) {
      throw new Error('No token to refresh');
    }

    try {
      const response = await authService.refreshToken(state.token);
      const { user, token } = response;

      // Update session-scoped stored data
      storage.setSessionScoped(TOKEN_STORAGE_KEY, token);
      storage.setSessionScoped(USER_STORAGE_KEY, user);
      
      // Notify other tabs about token refresh
      notifyAuthChange('refresh', { user, token });

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      // Refresh failed, logout user
      await logout();
      throw error;
    }
  }, [state.token, logout]);

  const updateUser = useCallback((user: User) => {
    storage.setSessionScoped(USER_STORAGE_KEY, user);
    
    // Notify other tabs about user update
    notifyAuthChange('update', { user, token: state.token });
    
    dispatch({ type: 'UPDATE_USER', payload: user });
  }, [state.token]);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Cross-tab communication setup
  const setupCrossTabSync = useCallback(() => {
    // Set up BroadcastChannel for real-time communication
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel.current = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      
      broadcastChannel.current.addEventListener('message', (event) => {
        const { type, sessionId: senderSessionId, data } = event.data;
        
        // Ignore messages from our own session
        if (senderSessionId === sessionId.current) {
          return;
        }
        
        handleCrossTabAuthChange(type, data);
      });
    }
    
    // Set up localStorage event listener for fallback
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_CHANNEL) {
        try {
          const data = JSON.parse(event.newValue || '{}');
          const { type, sessionId: senderSessionId, data: authData } = data;
          
          // Ignore messages from our own session
          if (senderSessionId === sessionId.current) {
            return;
          }
          
          handleCrossTabAuthChange(type, authData);
        } catch (error) {
          console.error('Failed to parse cross-tab auth message:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Handle authentication changes from other tabs
  const handleCrossTabAuthChange = useCallback((type: string, data: any) => {
    switch (type) {
      case 'login':
      case 'register':
      case 'refresh':
        // Another tab logged in - we can show a notification but keep current session
        console.log(`Another tab performed ${type} with user:`, data?.user?.username);
        break;
        
      case 'logout':
        // Another tab logged out - we can show a notification but keep current session
        console.log('Another tab logged out');
        break;
        
      case 'update':
        // Another tab updated user data - sync if it's the same user
        if (state.user && data?.user && state.user.id === data.user.id) {
          dispatch({ type: 'UPDATE_USER', payload: data.user });
        }
        break;
        
      default:
        break;
    }
  }, [state.user]);

  // Notify other tabs about authentication changes
  const notifyAuthChange = useCallback((type: string, data: any) => {
    const message = {
      type,
      sessionId: sessionId.current,
      data,
      timestamp: Date.now(),
    };
    
    // Send via BroadcastChannel if available
    if (broadcastChannel.current) {
      broadcastChannel.current.postMessage(message);
    }
    
    // Fallback to localStorage event
    storage.set(AUTH_SYNC_CHANNEL, message);
    
    // Clean up the sync message after a short delay
    setTimeout(() => {
      storage.remove(AUTH_SYNC_CHANNEL);
    }, 100);
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    refreshToken,
    updateUser,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}