import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(() => jest.fn()),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: true,
  })),
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch for API calls
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Component Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    
    // Default successful auth response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'user' },
          token: 'mock-jwt-token'
        }
      })
    } as Response);
  });

  const AppWithRouter = () => <App />;

  it('should render login page when not authenticated', () => {
    render(<AppWithRouter />);
    
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should show main application when authenticated', async () => {
    // Pre-authenticate user
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user'
    }));

    render(<AppWithRouter />);

    // Should not show login page
    await waitFor(() => {
      expect(screen.queryByText('Sign in to your account')).not.toBeInTheDocument();
    });

    // Should show some part of the main application
    // Since we don't have complete pages yet, just verify login is not shown
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });

  it('should handle form validation on login page', async () => {
    render(<AppWithRouter />);

    // Try to submit empty form
    const loginButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(loginButton);

    // Should show validation errors
    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('should handle login form submission', async () => {
    render(<AppWithRouter />);

    // Fill in login form
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // Submit form
    fireEvent.click(loginButton);

    // Should attempt to make API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('should handle invalid login credentials', async () => {
    // Mock failed login response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Invalid credentials'
      })
    } as Response);

    render(<AppWithRouter />);

    // Fill in login form with invalid credentials
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'invalid' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(loginButton);

    // Should stay on login page
    await waitFor(() => {
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });
  });

  it('should have navigation links on login page', () => {
    render(<AppWithRouter />);

    // Should have registration link
    expect(screen.getByText('create a new account')).toBeInTheDocument();
    expect(screen.getByText('Forgot your password?')).toBeInTheDocument();
  });

  it('should show CRDT Editor branding', () => {
    render(<AppWithRouter />);

    expect(screen.getByText('CRDT Editor')).toBeInTheDocument();
  });

  it('should show demo credentials in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(<AppWithRouter />);

    expect(screen.getByText('Demo Credentials:')).toBeInTheDocument();
    expect(screen.getByText('Username: demo')).toBeInTheDocument();
    expect(screen.getByText('Password: DemoPassword123!')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });
});