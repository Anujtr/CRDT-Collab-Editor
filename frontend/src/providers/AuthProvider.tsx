import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { AuthState, User } from '../types';
import { authService } from '../services/auth/authService';
import { storage } from '../utils';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../utils/constants';

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

  // Initialize authentication state on app load
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const storedToken = storage.get(TOKEN_STORAGE_KEY);
      const storedUser = storage.get(USER_STORAGE_KEY);

      if (storedToken && storedUser) {
        // Verify token is still valid
        const isValid = await authService.verifyToken(storedToken);
        
        if (isValid) {
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: { user: storedUser, token: storedToken },
          });
        } else {
          // Token is invalid, clear stored data
          storage.remove(TOKEN_STORAGE_KEY);
          storage.remove(USER_STORAGE_KEY);
          dispatch({ type: 'AUTH_LOGOUT' });
        }
      } else {
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.login(username, password);
      
      const { user, token } = response;

      // Store authentication data
      storage.set(TOKEN_STORAGE_KEY, token);
      storage.set(USER_STORAGE_KEY, user);

      if (rememberMe) {
        // Store remember me preference for auto-login
        storage.set('rememberMe', true);
      }

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.register(username, email, password);
      
      const { user, token } = response;

      // Store authentication data
      storage.set(TOKEN_STORAGE_KEY, token);
      storage.set(USER_STORAGE_KEY, user);

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout API to invalidate token on server
      if (state.token) {
        await authService.logout(state.token);
      }
    } catch (error) {
      console.error('Failed to logout on server:', error);
      // Continue with local logout even if server logout fails
    } finally {
      // Clear local storage
      storage.remove(TOKEN_STORAGE_KEY);
      storage.remove(USER_STORAGE_KEY);
      storage.remove('rememberMe');

      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const refreshToken = async () => {
    if (!state.token) {
      throw new Error('No token to refresh');
    }

    try {
      const response = await authService.refreshToken(state.token);
      const { user, token } = response;

      // Update stored data
      storage.set(TOKEN_STORAGE_KEY, token);
      storage.set(USER_STORAGE_KEY, user);

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, token },
      });
    } catch (error) {
      // Refresh failed, logout user
      await logout();
      throw error;
    }
  };

  const updateUser = (user: User) => {
    storage.set(USER_STORAGE_KEY, user);
    dispatch({ type: 'UPDATE_USER', payload: user });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

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