import { authService } from './authService';
import { createMockUser } from '../../test-utils/mockData';

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock utils
jest.mock('../../utils', () => ({
  isTokenExpired: jest.fn(),
}));

import { isTokenExpired } from '../../utils';
const mockIsTokenExpired = isTokenExpired as jest.MockedFunction<typeof isTokenExpired>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('successfully logs in user', async () => {
      const mockResponse = {
        success: true,
        data: {
          user: createMockUser(),
          token: 'jwt-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await authService.login('testuser', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'password123' })
        }
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('throws error on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      } as Response);

      await expect(authService.login('invalid', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(authService.login('testuser', 'password')).rejects.toThrow('Network error');
    });
  });

  describe('register', () => {
    it('successfully registers user', async () => {
      const mockResponse = {
        success: true,
        data: {
          user: createMockUser({ username: 'newuser', email: 'new@example.com' }),
          token: 'jwt-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await authService.register('newuser', 'new@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'newuser', email: 'new@example.com', password: 'password123' })
        }
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('throws error on failed registration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Username already exists' }),
      } as Response);

      await expect(authService.register('existing', 'test@example.com', 'password123')).rejects.toThrow('Username already exists');
    });
  });

  describe('verifyToken', () => {
    it('returns false for expired token', async () => {
      mockIsTokenExpired.mockReturnValueOnce(true);

      const result = await authService.verifyToken('expired-token');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('verifies valid token with server', async () => {
      mockIsTokenExpired.mockReturnValueOnce(false);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const result = await authService.verifyToken('valid-token');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/me',
        {
          method: 'GET',
          headers: { 'Authorization': 'Bearer valid-token' }
        }
      );
    });

    it('returns false for invalid token from server', async () => {
      mockIsTokenExpired.mockReturnValueOnce(false);
      mockFetch.mockResolvedValueOnce({
        ok: false,
      } as Response);

      const result = await authService.verifyToken('invalid-token');

      expect(result).toBe(false);
    });

    it('handles server errors gracefully', async () => {
      mockIsTokenExpired.mockReturnValueOnce(false);
      mockFetch.mockRejectedValueOnce(new Error('Server error'));

      const result = await authService.verifyToken('token');

      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('successfully logs out user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      await authService.logout('valid-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/logout',
        {
          method: 'POST',
          headers: { 
            'Authorization': 'Bearer valid-token',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('handles logout errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'));

      // Should not throw error
      await expect(authService.logout('token')).resolves.toBeUndefined();
    });
  });

  describe('refreshToken', () => {
    it('successfully refreshes token', async () => {
      const mockResponse = {
        success: true,
        data: {
          user: createMockUser(),
          token: 'new-jwt-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await authService.refreshToken('old-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/refresh',
        {
          method: 'POST',
          headers: { 
            'Authorization': 'Bearer old-token',
            'Content-Type': 'application/json'
          }
        }
      );

      expect(result).toEqual(mockResponse.data);
    });

    it('throws error on failed refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Token expired' }),
      } as Response);

      await expect(authService.refreshToken('expired-token')).rejects.toThrow('Token expired');
    });
  });
});