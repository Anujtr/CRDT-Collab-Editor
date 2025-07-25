import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthProvider } from '../providers/AuthProvider';
import { createMockUser } from '../test-utils/mockData';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock auth service
jest.mock('../services/auth/authService', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    verifyToken: jest.fn(),
  },
}));

// Mock fetch for auth API calls
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

import { authService } from '../services/auth/authService';

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('Authentication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    
    // Default mock for verifyToken to return false for clean state
    mockAuthService.verifyToken.mockResolvedValue(false);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  );

  it('should handle complete authentication flow', async () => {
    // Mock successful login response
    mockAuthService.login.mockResolvedValueOnce({
      user: createMockUser(),
      token: 'mock-jwt-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Initially not authenticated
    expect(result.current.isAuthenticated).toBe(false);

    // Perform login
    await act(async () => {
      await result.current.login('testuser', 'password123');
    });

    // Should be authenticated
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.username).toBe('testuser');
    expect(result.current.token).toBe('mock-jwt-token');

    // Should store token in localStorage
    expect(localStorage.getItem('crdt-auth-token')).toBe('"mock-jwt-token"');
  });

  it('should handle authentication persistence', async () => {
    // Mock verifyToken to return true for existing token
    mockAuthService.verifyToken.mockResolvedValueOnce(true);
    
    // Simulate existing token in localStorage
    localStorage.setItem('crdt-auth-token', '"existing-token"');
    localStorage.setItem('crdt-user-data', JSON.stringify(createMockUser()));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should restore authentication state
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.username).toBe('testuser');
    expect(result.current.token).toBe('existing-token');
  });

  it('should handle logout properly', async () => {
    // Mock initial authentication state
    mockAuthService.verifyToken.mockResolvedValueOnce(true);
    mockAuthService.logout.mockResolvedValueOnce(undefined);
    
    // Set up authenticated state
    localStorage.setItem('crdt-auth-token', '"test-token"');
    localStorage.setItem('crdt-user-data', JSON.stringify(createMockUser()));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should be authenticated
    expect(result.current.isAuthenticated).toBe(true);

    // Perform logout
    await act(async () => {
      await result.current.logout();
    });

    // Should be logged out
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
    expect(result.current.token).toBe(null);

    // Should clear localStorage
    expect(localStorage.getItem('crdt-auth-token')).toBe(null);
    expect(localStorage.getItem('crdt-user-data')).toBe(null);
  });

  it('should handle auth errors gracefully', async () => {
    // Mock failed login response
    mockAuthService.login.mockRejectedValueOnce(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Attempt login with invalid credentials
    await act(async () => {
      try {
        await result.current.login('invalid', 'wrong');
      } catch (error) {
        // Expected to throw
      }
    });

    // Should remain unauthenticated
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
    expect(result.current.token).toBe(null);
  });

  it('should handle network errors', async () => {
    // Mock network error
    mockAuthService.login.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Attempt login with network error
    await act(async () => {
      try {
        await result.current.login('testuser', 'password');
      } catch (error) {
        // Expected to throw
      }
    });

    // Should remain unauthenticated
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('should provide all required auth interface methods', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.register).toBe('function');
    expect(typeof result.current.refreshToken).toBe('function');
    expect(typeof result.current.updateUser).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });
});