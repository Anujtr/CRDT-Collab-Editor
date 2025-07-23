// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
export const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8080/ws';

// Authentication
export const TOKEN_STORAGE_KEY = 'crdt-auth-token';
export const USER_STORAGE_KEY = 'crdt-user-data';
export const REMEMBER_ME_STORAGE_KEY = 'crdt-remember-me';

// WebSocket
export const WS_RECONNECT_INTERVAL = 3000;
export const WS_MAX_RETRIES = 5;
export const WS_HEARTBEAT_INTERVAL = 30000;

// Editor
export const EDITOR_AUTOSAVE_INTERVAL = 2000;
export const EDITOR_SYNC_DEBOUNCE = 300;
export const CURSOR_UPDATE_THROTTLE = 100;

// Document
export const MAX_DOCUMENT_TITLE_LENGTH = 100;
export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5MB
export const DOCUMENT_LIST_PAGE_SIZE = 20;

// User Presence
export const PRESENCE_UPDATE_INTERVAL = 1000;
export const PRESENCE_TIMEOUT = 10000;
export const USER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#6b7280', // gray
];

// UI
export const THEME_STORAGE_KEY = 'crdt-theme';
export const SIDEBAR_STORAGE_KEY = 'crdt-sidebar-open';
export const NOTIFICATION_TIMEOUT = 5000;
export const TOAST_TIMEOUT = 4000;

// Offline
export const OFFLINE_STORAGE_KEY = 'crdt-offline-data';
export const OFFLINE_SYNC_INTERVAL = 5000;
export const MAX_OFFLINE_OPERATIONS = 1000;

// Validation
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 8;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Feature Flags
export const FEATURES = {
  OFFLINE_MODE: true,
  DARK_THEME: true,
  DOCUMENT_SHARING: true,
  USER_PRESENCE: true,
  KEYBOARD_SHORTCUTS: true,
  EXPORT_DOCUMENTS: true,
  DOCUMENT_TEMPLATES: false, // Future feature
  COLLABORATION_CHAT: false, // Future feature
  DOCUMENT_HISTORY: false, // Future feature
};

// Keyboard Shortcuts
export const SHORTCUTS = {
  SAVE_DOCUMENT: 'Ctrl+S',
  NEW_DOCUMENT: 'Ctrl+N',
  TOGGLE_SIDEBAR: 'Ctrl+B',
  TOGGLE_THEME: 'Ctrl+Shift+T',
  FOCUS_SEARCH: 'Ctrl+K',
  BOLD: 'Ctrl+B',
  ITALIC: 'Ctrl+I',
  UNDERLINE: 'Ctrl+U',
  STRIKETHROUGH: 'Ctrl+Shift+X',
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  FORBIDDEN: 'Access denied. You do not have permission.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  WEBSOCKET_ERROR: 'Connection lost. Attempting to reconnect...',
  DOCUMENT_NOT_FOUND: 'Document not found or you do not have access.',
  DOCUMENT_SAVE_ERROR: 'Failed to save document. Changes are stored locally.',
  AUTH_EXPIRED: 'Your session has expired. Please log in again.',
  OFFLINE_MODE: 'You are offline. Changes will be synced when connection is restored.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Welcome back!',
  REGISTER_SUCCESS: 'Account created successfully!',
  DOCUMENT_CREATED: 'Document created successfully!',
  DOCUMENT_SAVED: 'Document saved!',
  DOCUMENT_SHARED: 'Document shared successfully!',
  SETTINGS_UPDATED: 'Settings updated successfully!',
  CONNECTION_RESTORED: 'Connection restored. Syncing changes...',
  OFFLINE_CHANGES_SYNCED: 'Offline changes synced successfully!',
};

// Document Types
export const DOCUMENT_TYPES = {
  TEXT: 'text',
  MARKDOWN: 'markdown',
  CODE: 'code',
} as const;

// File Extensions
export const SUPPORTED_EXPORT_FORMATS = [
  { label: 'Plain Text (.txt)', value: 'txt', mimeType: 'text/plain' },
  { label: 'Markdown (.md)', value: 'md', mimeType: 'text/markdown' },
  { label: 'JSON (.json)', value: 'json', mimeType: 'application/json' },
  { label: 'HTML (.html)', value: 'html', mimeType: 'text/html' },
];

// Editor Toolbar Buttons
export const TOOLBAR_BUTTONS = [
  { type: 'bold', icon: 'Bold', tooltip: 'Bold (Ctrl+B)' },
  { type: 'italic', icon: 'Italic', tooltip: 'Italic (Ctrl+I)' },
  { type: 'underline', icon: 'Underline', tooltip: 'Underline (Ctrl+U)' },
  { type: 'strikethrough', icon: 'Strikethrough', tooltip: 'Strikethrough (Ctrl+Shift+X)' },
  { type: 'separator' },
  { type: 'heading1', icon: 'Heading1', tooltip: 'Heading 1' },
  { type: 'heading2', icon: 'Heading2', tooltip: 'Heading 2' },
  { type: 'heading3', icon: 'Heading3', tooltip: 'Heading 3' },
  { type: 'separator' },
  { type: 'bulletList', icon: 'List', tooltip: 'Bullet List' },
  { type: 'numberedList', icon: 'ListOrdered', tooltip: 'Numbered List' },
  { type: 'separator' },
  { type: 'blockquote', icon: 'Quote', tooltip: 'Quote' },
  { type: 'codeBlock', icon: 'Code', tooltip: 'Code Block' },
  { type: 'separator' },
  { type: 'link', icon: 'Link', tooltip: 'Insert Link' },
  { type: 'image', icon: 'Image', tooltip: 'Insert Image' },
];

// Collaborative Editor Settings
export const COLLABORATION_SETTINGS = {
  MAX_COLLABORATORS: 10,
  CURSOR_BLINK_RATE: 1000,
  SELECTION_HIGHLIGHT_OPACITY: 0.3,
  AWARENESS_TIMEOUT: 30000,
  OPERATION_BATCH_SIZE: 10,
  CONFLICT_RESOLUTION_STRATEGY: 'last-write-wins',
};

// Performance Settings
export const PERFORMANCE_SETTINGS = {
  VIRTUAL_SCROLLING_THRESHOLD: 1000, // Enable virtual scrolling for documents > 1000 lines
  DEBOUNCE_SEARCH: 300,
  THROTTLE_SCROLL: 16, // ~60fps
  CACHE_DOCUMENTS: 50, // Keep 50 documents in memory
  LAZY_LOAD_IMAGES: true,
  ENABLE_SERVICE_WORKER: true,
};