import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EditorProvider } from '../components/editor/EditorProvider';
import { AuthProvider } from '../providers/AuthProvider';
import { ConnectionProvider } from '../contexts/ConnectionContext';

// Mock the API response for read-only access
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the collaborative editor hook
jest.mock('../hooks/useCollaborativeEditor', () => ({
  useCollaborativeEditor: () => ({
    editor: {
      children: [{ type: 'paragraph', children: [{ text: 'Test content' }] }],
      selection: null,
      operations: [],
      marks: null,
      insertText: jest.fn(),
      insertBreak: jest.fn(),
    },
    value: [{ type: 'paragraph', children: [{ text: 'Test content' }] }],
    status: 'connected',
    isSynced: true,
    collaborators: [],
    isLoading: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    setValue: jest.fn(),
    sendCursorUpdate: jest.fn(),
    reconnect: jest.fn(),
  }),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <AuthProvider>
      <ConnectionProvider>
        {children}
      </ConnectionProvider>
    </AuthProvider>
  </BrowserRouter>
);

describe('Read-Only Document Access', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Mock session storage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(() => 'test-session-id'),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
    
    // Mock localStorage with session-scoped token
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => {
          if (key === 'crdt-auth-token-test-session-id') {
            return JSON.stringify('mock-token');
          }
          if (key === 'crdt-user-data-test-session-id') {
            return JSON.stringify({ id: '1', username: 'testuser' });
          }
          return null;
        }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  test('shows read-only banner for users without write access', async () => {
    // Mock API response with hasWriteAccess: false
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          metadata: {
            id: 'doc-1',
            title: 'Test Document',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z',
            ownerId: 'other-user',
            ownerName: 'Other User',
            collaboratorCount: 0,
            isPublic: true,
            lastActivity: '2023-01-01T00:00:00Z',
          },
          state: [],
          hasWriteAccess: false,
        },
      }),
    });

    render(
      <TestWrapper>
        <EditorProvider documentId="doc-1">
          <div data-testid="editor-content">Editor Content</div>
        </EditorProvider>
      </TestWrapper>
    );

    // Wait for the document to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/documents/doc-1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    // Check if read-only banner appears
    await waitFor(() => {
      expect(screen.getByText('Read-only Access')).toBeInTheDocument();
      expect(screen.getByText('You have read-only access to this document. Changes cannot be made.')).toBeInTheDocument();
    });
  });

  test('allows full access for users with write access', async () => {
    // Mock API response with hasWriteAccess: true
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          metadata: {
            id: 'doc-1',
            title: 'Test Document',
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z',
            ownerId: 'current-user',
            ownerName: 'Current User',
            collaboratorCount: 0,
            isPublic: false,
            lastActivity: '2023-01-01T00:00:00Z',
          },
          state: [],
          hasWriteAccess: true,
        },
      }),
    });

    render(
      <TestWrapper>
        <EditorProvider documentId="doc-1">
          <div data-testid="editor-content">Editor Content</div>
        </EditorProvider>
      </TestWrapper>
    );

    // Wait for the document to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Check that read-only banner does NOT appear
    await waitFor(() => {
      expect(screen.queryByText('Read-only Access')).not.toBeInTheDocument();
    });
  });

  test('handles document loading error gracefully', async () => {
    // Mock API error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        error: 'Access denied',
      }),
    });

    render(
      <TestWrapper>
        <EditorProvider documentId="doc-1">
          <div data-testid="editor-content">Editor Content</div>
        </EditorProvider>
      </TestWrapper>
    );

    // Wait for the error to be handled
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Should show error message instead of content
    await waitFor(() => {
      expect(screen.getByText('Failed to load document')).toBeInTheDocument();
    });
  });
});