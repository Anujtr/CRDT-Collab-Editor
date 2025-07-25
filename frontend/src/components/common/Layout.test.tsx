import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { useAuth } from '../../hooks/useAuth';
import { createMockAuthState } from '../../test-utils/mockData';

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

const LayoutWithRouter = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <Layout>{children}</Layout>
  </BrowserRouter>
);

describe('Layout Component', () => {
  const mockLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(createMockAuthState({
      logout: mockLogout,
    }));
  });

  it('renders layout with header and navigation', () => {
    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    expect(screen.getByText('CRDT Editor')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('shows user information in header', () => {
    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('shows navigation menu', () => {
    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('handles logout when logout button is clicked', async () => {
    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    // Click logout button by title attribute
    const logoutButton = screen.getByTitle('Logout');
    fireEvent.click(logoutButton);
    
    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows mobile menu toggle', () => {
    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    // Mobile menu button should be present
    const menuButton = screen.getByLabelText('Toggle menu');
    expect(menuButton).toBeInTheDocument();
  });

  it('handles missing user gracefully', () => {
    mockUseAuth.mockReturnValue(createMockAuthState({
      user: null,
      logout: mockLogout,
    }));

    render(
      <LayoutWithRouter>
        <div>Test Content</div>
      </LayoutWithRouter>
    );
    
    // When user is null, username displays as empty but component still renders
    expect(screen.getByText('CRDT Editor')).toBeInTheDocument();
    // Logout button should still be available
    expect(screen.getByTitle('Logout')).toBeInTheDocument();
  });
});