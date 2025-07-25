import { User } from '../types';

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: '1',
  username: 'testuser',
  email: 'test@example.com',
  role: 'user',
  permissions: ['document:read', 'document:write'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

export const createMockAuthState = (overrides: any = {}) => ({
  user: createMockUser(),
  token: 'valid-token',
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  updateUser: jest.fn(),
  clearError: jest.fn(),
  ...overrides,
});