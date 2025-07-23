import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../hooks/useAuth';
import { AuthProvider } from '../providers/AuthProvider';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch for auth API calls
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Authentication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('should handle complete authentication flow', async () => {
    // Mock successful login response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          user: { id: '1', username: 'testuser', email: 'test@example.com' },
          token: 'mock-jwt-token'
        }
      })
    } as Response);

    const { result } = renderHook(() => useAuth(), { wrapper });

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
    expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
  });

  it('should handle authentication persistence', () => {
    // Simulate existing token in localStorage
    localStorage.setItem('auth_token', 'existing-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '1',
      username: 'testuser',
      email: 'test@example.com'
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Should restore authentication state
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.username).toBe('testuser');
    expect(result.current.token).toBe('existing-token');
  });

  it('should handle logout properly', async () => {
    // Set up authenticated state
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '1',
      username: 'testuser',
      email: 'test@example.com'
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

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
    expect(localStorage.getItem('auth_token')).toBe(null);
    expect(localStorage.getItem('auth_user')).toBe(null);
  });

  it('should handle auth errors gracefully', async () => {
    // Mock failed login response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Invalid credentials'
      })
    } as Response);

    const { result } = renderHook(() => useAuth(), { wrapper });

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
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth(), { wrapper });

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