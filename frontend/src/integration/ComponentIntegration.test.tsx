import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from '../App';
import { createMockUser } from '../test-utils/mockData';
import { AuthProvider } from '../providers/AuthProvider';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { Layout } from '../components/common/Layout';
import { LoginPage } from '../components/auth/LoginPage';
import { RegisterPage } from '../components/auth/RegisterPage';
import { DashboardPage } from '../components/common/DashboardPage';
import { EditorPage } from '../components/editor/EditorPage';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

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

describe.skip('Component Integration Tests', () => {
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
          user: createMockUser(),
          token: 'mock-jwt-token'
        }
      })
    } as Response);
  });

  // Since App includes BrowserRouter, we need to replace it with MemoryRouter for testing
  const AppWithoutRouter = () => {
    // Get the App's content without the BrowserRouter wrapper
    const AppContent = () => {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            
            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DashboardPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/document/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <EditorPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      );
    };

    return (
      <ErrorBoundary>
        <AuthProvider>
          <MemoryRouter>
            <AppContent />
          </MemoryRouter>
        </AuthProvider>
      </ErrorBoundary>
    );
  };

  const AppWithRouter = AppWithoutRouter;

  it('should render login page when not authenticated', () => {
    render(<AppWithRouter />);
    
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should show main application when authenticated', async () => {
    // Pre-authenticate user
    localStorage.setItem('crdt-auth-token', '"test-token"');
    localStorage.setItem('crdt-user-data', JSON.stringify(createMockUser()));

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