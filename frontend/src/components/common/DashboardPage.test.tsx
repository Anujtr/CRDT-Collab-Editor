import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

// Mock react-router-dom navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const DashboardPageWithRouter = () => (
  <BrowserRouter>
    <DashboardPage />
  </BrowserRouter>
);

describe('DashboardPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard header', () => {
    render(<DashboardPageWithRouter />);
    
    expect(screen.getByText('Your Documents')).toBeInTheDocument();
    expect(screen.getByText('Create, edit, and collaborate on documents in real-time')).toBeInTheDocument();
  });

  it('shows search input', () => {
    render(<DashboardPageWithRouter />);
    
    expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
  });

  it('shows new document button', () => {
    render(<DashboardPageWithRouter />);
    
    expect(screen.getByRole('button', { name: /new document/i })).toBeInTheDocument();
  });

  it('opens create document modal when new document button is clicked', () => {
    render(<DashboardPageWithRouter />);
    
    const newDocButton = screen.getByRole('button', { name: /new document/i });
    fireEvent.click(newDocButton);
    
    expect(screen.getByText('Create New Document')).toBeInTheDocument();
    expect(screen.getByLabelText('Document Title')).toBeInTheDocument();
  });

  it('displays mock documents after loading', async () => {
    render(<DashboardPageWithRouter />);
    
    // Wait for loading to complete (component has 1 second delay)
    await waitFor(() => {
      expect(screen.getByText('Project Planning Document')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    expect(screen.getByText('Meeting Notes - Q4 Review')).toBeInTheDocument();
    expect(screen.getByText('Technical Specification')).toBeInTheDocument();
  });

  it('shows loading skeleton initially', () => {
    render(<DashboardPageWithRouter />);
    
    // Loading skeletons should be present initially
    const loadingElements = screen.getAllByTestId('loading-skeleton');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('filters documents based on search query', async () => {
    render(<DashboardPageWithRouter />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText('Project Planning Document')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    const searchInput = screen.getByPlaceholderText('Search documents...');
    fireEvent.change(searchInput, { target: { value: 'Meeting' } });
    
    expect(screen.getByText('Meeting Notes - Q4 Review')).toBeInTheDocument();
    expect(screen.queryByText('Project Planning Document')).not.toBeInTheDocument();
  });

  it('shows empty state when no documents match search', async () => {
    render(<DashboardPageWithRouter />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText('Project Planning Document')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    const searchInput = screen.getByPlaceholderText('Search documents...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    
    expect(screen.getByText('No documents found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search terms')).toBeInTheDocument();
  });

  it('handles document creation', async () => {
    render(<DashboardPageWithRouter />);
    
    // Open create modal
    const newDocButton = screen.getByRole('button', { name: /new document/i });
    fireEvent.click(newDocButton);
    
    // Fill in title
    const titleInput = screen.getByLabelText('Document Title');
    fireEvent.change(titleInput, { target: { value: 'Test Document' } });
    
    // Submit form
    const createButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(createButton);
    
    // Should navigate to new document
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/document/'));
  });

  it('shows document metadata', async () => {
    render(<DashboardPageWithRouter />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText('Project Planning Document')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    // Check for collaborator count
    expect(screen.getByText('3 collaborators')).toBeInTheDocument();
    expect(screen.getByText('1 collaborator')).toBeInTheDocument();
    
    // Check for public badge
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('handles document card interactions', async () => {
    render(<DashboardPageWithRouter />);
    
    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText('Project Planning Document')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    // Click on document title should navigate
    const docTitle = screen.getByText('Project Planning Document');
    fireEvent.click(docTitle);
    
    expect(mockNavigate).toHaveBeenCalledWith('/document/1');
  });
});