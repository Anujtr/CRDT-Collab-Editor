import { renderHook } from '@testing-library/react';
import { useConnection } from './useConnection';

// Mock socket.io-client
const mockSocket = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  emit: jest.fn(),
  on: jest.fn(() => jest.fn()),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  connected: true,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock auth hook
jest.mock('./useAuth', () => ({
  useAuth: () => ({
    token: 'mock-token',
    isAuthenticated: true,
    user: { id: '1', username: 'testuser' },
    login: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
    refreshToken: jest.fn(),
    updateUser: jest.fn(),
    clearError: jest.fn(),
    isLoading: false,
    error: null,
  }),
}));

describe('useConnection Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = true;
  });

  it('initializes with disconnected state', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    
    expect(result.current.connectionState.status).toBe('disconnected');
    expect(result.current.connectionState.retryCount).toBe(0);
  });

  it('provides connection interface functions', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.send).toBe('function');
    expect(typeof result.current.on).toBe('function');
    expect(typeof result.current.off).toBe('function');
  });

  it('provides connection status flags', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    
    expect(typeof result.current.isConnected).toBe('boolean');
    expect(typeof result.current.isAuthenticated).toBe('boolean');
  });

  it('does not auto-connect when autoConnect is disabled', () => {
    renderHook(() => useConnection({ autoConnect: false }));
    
    // Should not attempt to connect immediately
    expect(mockSocket.connect).not.toHaveBeenCalled();
  });

  it('returns false when sending message without connection', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    
    const success = result.current.send('test-event', { data: 'test' });
    
    expect(success).toBe(false);
  });

  it('registers event listeners and returns cleanup function', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    const callback = jest.fn();
    
    const cleanup = result.current.on('test-event', callback);
    
    expect(typeof cleanup).toBe('function');
  });

  it('handles connection state correctly', () => {
    const { result } = renderHook(() => useConnection({ autoConnect: false }));
    
    // Initial state should be disconnected
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });
});