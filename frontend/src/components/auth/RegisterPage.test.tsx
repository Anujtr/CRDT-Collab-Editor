import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import { useAuth } from '../../hooks/useAuth';

// Mock useAuth hook
jest.mock('../../hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const RegisterPageWithRouter = () => (
  <BrowserRouter>
    <RegisterPage />
  </BrowserRouter>
);

describe('RegisterPage Component', () => {
  const mockRegister = jest.fn();
  const mockClearError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: jest.fn(),
      register: mockRegister,
      logout: jest.fn(),
      refreshToken: jest.fn(),
      updateUser: jest.fn(),
      clearError: mockClearError,
    });
  });

  it('renders registration form correctly', () => {
    render(<RegisterPageWithRouter />);
    
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<RegisterPageWithRouter />);

    // Try to submit empty form
    const registerButton = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(registerButton);

    // Should show validation errors
    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  it('validates password requirements', async () => {
    render(<RegisterPageWithRouter />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    const registerButton = screen.getByRole('button', { name: /create account/i });

    // Enter short password
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('validates password confirmation match', async () => {
    render(<RegisterPageWithRouter />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const registerButton = screen.getByRole('button', { name: /create account/i });

    // Enter mismatched passwords
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Different123!' } });
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('calls register function with correct data', async () => {
    render(<RegisterPageWithRouter />);

    // Fill in registration form
    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const registerButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(usernameInput, { target: { value: 'newuser' } });
    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123!' } });

    // Submit form
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('newuser', 'newuser@example.com', 'Password123!');
    });
  });

  it('shows login link', () => {
    render(<RegisterPageWithRouter />);
    
    expect(screen.getByText('sign in to your existing account')).toBeInTheDocument();
  });

  it('shows CRDT Editor branding', () => {
    render(<RegisterPageWithRouter />);
    
    expect(screen.getByText('CRDT Editor')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    render(<RegisterPageWithRouter />);
    
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    const toggleButton = screen.getAllByRole('button')[0]; // First toggle button

    // Initially password should be hidden
    expect(passwordInput.type).toBe('password');

    // Click toggle button
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    // Click again to hide
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('password');
  });

  it('handles registration errors', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: 'Registration failed',
      login: jest.fn(),
      register: mockRegister,
      logout: jest.fn(),
      refreshToken: jest.fn(),
      updateUser: jest.fn(),
      clearError: mockClearError,
    });

    render(<RegisterPageWithRouter />);
    
    // Check that clearError is called when component mounts (clears any existing errors)
    expect(mockClearError).toHaveBeenCalled();
  });
});