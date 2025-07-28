// Re-export shared types from the shared package
export * from '../../../shared/src/types/auth';

// Frontend-specific types
export interface Document {
  id: string;
  title: string;
  content: any; // Slate.js content
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  collaborators: User[];
  isPublic: boolean;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerName: string;
  collaboratorCount: number;
  isPublic: boolean;
  lastActivity: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPresence {
  userId: string;
  username: string;
  color: string;
  cursor?: {
    anchor: any;
    focus: any;
  };
  selection?: any;
  lastSeen: number;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error';
  lastConnected?: number;
  retryCount: number;
  error?: string;
  lastDisconnectReason?: string;
  lastConnectError?: string;
  manualDisconnect?: boolean;
  authenticatedAt?: number;
}

export interface EditorState {
  value: any; // Slate.js value
  selection: any;
  isComposing: boolean;
  isFocused: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AppState {
  auth: AuthState;
  connection: ConnectionState;
  documents: DocumentMetadata[];
  currentDocument: Document | null;
  presence: UserPresence[];
  editor: EditorState;
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    isOffline: boolean;
    notifications: Notification[];
  };
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actions?: {
    label: string;
    action: () => void;
  }[];
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// WebSocket event types
export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: number;
}

export interface DocumentUpdateEvent extends WebSocketEvent {
  type: 'document-update';
  payload: {
    documentId: string;
    operations: any[];
    userId: string;
    timestamp: number;
  };
}

export interface CursorUpdateEvent extends WebSocketEvent {
  type: 'cursor-update';
  payload: {
    documentId: string;
    userId: string;
    cursor: any;
    selection: any;
  };
}

export interface UserJoinedEvent extends WebSocketEvent {
  type: 'user-joined';
  payload: {
    documentId: string;
    user: UserPresence;
  };
}

export interface UserLeftEvent extends WebSocketEvent {
  type: 'user-left';
  payload: {
    documentId: string;
    userId: string;
  };
}

// Form types
export interface LoginFormData {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface CreateDocumentFormData {
  title: string;
  isPublic: boolean;
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

// Utility types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export type ThemeMode = 'light' | 'dark' | 'system';