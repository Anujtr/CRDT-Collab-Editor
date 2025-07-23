import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Mock the authentication hook
jest.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    updateUser: jest.fn(),
    clearError: jest.fn(),
  }),
}));

// Mock the connection hook
jest.mock('./hooks/useConnection', () => ({
  useConnection: () => ({
    connectionState: {
      status: 'disconnected',
      retryCount: 0,
    },
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  }),
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('shows login page for unauthenticated users', () => {
    render(<App />);
    
    // Should redirect to login and show the sign in form
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it('shows CRDT Editor branding', () => {
    render(<App />);
    
    expect(screen.getByText('CRDT Editor')).toBeInTheDocument();
  });
});