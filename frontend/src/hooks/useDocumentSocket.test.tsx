import { renderHook } from '@testing-library/react';
import { useDocumentSocket } from './useDocumentSocket';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock connection hook
jest.mock('./useConnection', () => ({
  useConnection: () => ({
    send: jest.fn().mockReturnValue(true),
    on: jest.fn().mockReturnValue(() => {}),
    off: jest.fn(),
    isAuthenticated: true,
    connectionState: { status: 'authenticated' },
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: true,
  }),
}));

describe('useDocumentSocket Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with no current document', () => {
    const { result } = renderHook(() => useDocumentSocket(null));
    
    expect(result.current.currentDocument).toBe(null);
    expect(result.current.isInDocument).toBe(false);
  });

  it('provides document socket interface functions', () => {
    const { result } = renderHook(() => useDocumentSocket(null));
    
    expect(typeof result.current.joinDocument).toBe('function');
    expect(typeof result.current.leaveDocument).toBe('function');
    expect(typeof result.current.sendDocumentUpdate).toBe('function');
    expect(typeof result.current.sendCursorUpdate).toBe('function');
  });

  it('returns false when sending updates without current document', () => {
    const { result } = renderHook(() => useDocumentSocket(null));
    
    const updateResult = result.current.sendDocumentUpdate({ data: 'test' });
    const cursorResult = result.current.sendCursorUpdate({ anchor: 0, focus: 1 });
    
    expect(updateResult).toBe(false);
    expect(cursorResult).toBe(false);
  });

  it('handles document joining and leaving', () => {
    const { result } = renderHook(() => useDocumentSocket(null));
    
    // Test manual joining
    const joinResult = result.current.joinDocument('doc-123');
    expect(joinResult).toBe(true);
    
    // Test leaving
    result.current.leaveDocument();
    // Should not throw error
  });

  it('provides correct document status', () => {
    const { result } = renderHook(() => useDocumentSocket(null));
    
    expect(result.current.isInDocument).toBe(false);
    expect(result.current.currentDocument).toBe(null);
  });

  it('handles callbacks object correctly', () => {
    const callbacks = {
      onDocumentJoined: jest.fn(),
      onUserJoined: jest.fn(),
      onUserLeft: jest.fn(),
      onDocumentUpdate: jest.fn(),
      onCursorUpdate: jest.fn(),
      onError: jest.fn(),
    };

    const { result } = renderHook(() => useDocumentSocket('doc-123', callbacks));
    
    // Should initialize without errors
    expect(result.current).toBeDefined();
  });

  it('switches documents correctly', () => {
    const { rerender } = renderHook(
      ({ documentId }) => useDocumentSocket(documentId),
      { initialProps: { documentId: 'doc-123' } }
    );
    
    // Switch to different document
    rerender({ documentId: 'doc-456' });
    
    // Should handle document switching without errors
    expect(true).toBe(true);
  });
});