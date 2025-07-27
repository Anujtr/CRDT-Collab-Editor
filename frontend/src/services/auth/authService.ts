import { APIResponse, User } from '../../types';
import { API_BASE_URL } from '../../utils/constants';
import { isTokenExpired } from '../../utils';

interface LoginResponse {
  user: User;
  token: string;
  expiresAt: string;
}

interface RegisterResponse {
  user: User;
  token: string;
  expiresAt: string;
}

class AuthService {
  private baseURL = API_BASE_URL;

  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.error || errorData.message || `Login failed (${response.status})`;
      throw new Error(errorMessage);
    }

    const data: APIResponse<LoginResponse> = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error(data.error || 'Login failed');
    }

    return data.data;
  }

  async register(username: string, email: string, password: string): Promise<RegisterResponse> {
    const response = await fetch(`${this.baseURL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.error || errorData.message || `Registration failed (${response.status})`;
      throw new Error(errorMessage);
    }

    const data: APIResponse<RegisterResponse> = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error(data.error || 'Registration failed');
    }

    return data.data;
  }

  async logout(token: string): Promise<void> {
    try {
      await fetch(`${this.baseURL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout request failed:', error);
      // Don't throw error - logout should continue even if server request fails
    }
  }

  async refreshToken(token: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Token refresh failed');
    }

    const data: APIResponse<LoginResponse> = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error(data.error || 'Token refresh failed');
    }

    return data.data;
  }

  async verifyToken(token: string): Promise<boolean> {
    try {
      // First check if token is expired locally
      if (isTokenExpired(token)) {
        return false;
      }

      // Verify with server
      const response = await fetch(`${this.baseURL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  }

  async getCurrentUser(token: string): Promise<User> {
    const response = await fetch(`${this.baseURL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get user info');
    }

    const data: APIResponse<User> = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error(data.error || 'Failed to get user info');
    }

    return data.data;
  }

  async updatePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update password');
    }

    const data: APIResponse = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to update password');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to request password reset');
    }

    const data: APIResponse = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to request password reset');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/auth/reset-password/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to reset password');
    }

    const data: APIResponse = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to reset password');
    }
  }

  // Helper method to create authenticated headers
  createAuthHeaders(token: string): HeadersInit {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // Helper method to handle API errors
  private handleApiError(response: Response): never {
    if (response.status === 401) {
      throw new Error('Unauthorized. Please log in again.');
    } else if (response.status === 403) {
      throw new Error('Access denied. You do not have permission.');
    } else if (response.status === 404) {
      throw new Error('Resource not found.');
    } else if (response.status >= 500) {
      throw new Error('Server error. Please try again later.');
    } else {
      throw new Error('Request failed. Please check your input and try again.');
    }
  }
}

export const authService = new AuthService();