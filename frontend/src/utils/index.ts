import { type ClassValue, clsx } from 'clsx';
import { USER_COLORS } from './constants';

/**
 * Utility function for combining class names
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Generate a consistent color for a user based on their ID
 */
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: string | number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }

  return date.toLocaleDateString();
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username format
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  return usernameRegex.test(username) && username.length >= 3 && username.length <= 30;
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(password)
  );
}

/**
 * Get password strength score
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(password)) score++;

  if (score <= 2) {
    return { score, label: 'Weak', color: 'text-red-500' };
  } else if (score <= 4) {
    return { score, label: 'Medium', color: 'text-yellow-500' };
  } else {
    return { score, label: 'Strong', color: 'text-green-500' };
  }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Download content as file
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  return window.innerWidth < 768;
}

/**
 * Check if user prefers dark mode
 */
export function prefersDarkMode(): boolean {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Get system theme
 */
export function getSystemTheme(): 'light' | 'dark' {
  return prefersDarkMode() ? 'dark' : 'light';
}

/**
 * Sanitize HTML content
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Format document title for URL
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse JWT token payload
 */
export function parseJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to parse JWT:', error);
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJWT(token);
    if (!payload || !payload.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch (error) {
    return true;
  }
}

/**
 * Get time until token expires
 */
export function getTokenTimeToExpiry(token: string): number {
  try {
    const payload = parseJWT(token);
    if (!payload || !payload.exp) return 0;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return Math.max(0, payload.exp - currentTime);
  } catch (error) {
    return 0;
  }
}

/**
 * Generate a unique session ID for this tab/window
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

/**
 * Get the current session ID, creating one if it doesn't exist
 */
export function getSessionId(): string {
  const existingId = window.sessionStorage.getItem('crdt-session-id');
  if (existingId) {
    return existingId;
  }
  
  const newId = generateSessionId();
  window.sessionStorage.setItem('crdt-session-id', newId);
  return newId;
}

/**
 * Session-aware storage helpers
 */
export const sessionStorageHelper = {
  get: (key: string): any => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Failed to get ${key} from sessionStorage:`, error);
      return null;
    }
  },

  set: (key: string, value: any): boolean => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to set ${key} in sessionStorage:`, error);
      return false;
    }
  },

  remove: (key: string): boolean => {
    try {
      window.sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove ${key} from sessionStorage:`, error);
      return false;
    }
  },

  clear: (): boolean => {
    try {
      window.sessionStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear sessionStorage:', error);
      return false;
    }
  },
};

/**
 * Local storage helpers
 */
export const storage = {
  get: (key: string): any => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Failed to get ${key} from localStorage:`, error);
      return null;
    }
  },

  set: (key: string, value: any): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to set ${key} in localStorage:`, error);
      return false;
    }
  },

  remove: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove ${key} from localStorage:`, error);
      return false;
    }
  },

  clear: (): boolean => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      return false;
    }
  },

  // Session-scoped storage methods
  getSessionScoped: (key: string): any => {
    const sessionId = getSessionId();
    const sessionKey = `${key}-${sessionId}`;
    return storage.get(sessionKey);
  },

  setSessionScoped: (key: string, value: any): boolean => {
    const sessionId = getSessionId();
    const sessionKey = `${key}-${sessionId}`;
    return storage.set(sessionKey, value);
  },

  removeSessionScoped: (key: string): boolean => {
    const sessionId = getSessionId();
    const sessionKey = `${key}-${sessionId}`;
    return storage.remove(sessionKey);
  },

  // Get all session-scoped keys for cleanup
  getSessionKeys: (prefix: string): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${prefix}-session-`)) {
        keys.push(key);
      }
    }
    return keys;
  },

  // Clean up session-scoped data for inactive sessions
  cleanupInactiveSessions: (prefix: string, activeSessionId: string): void => {
    const sessionKeys = storage.getSessionKeys(prefix);
    const activeSessionSuffix = `-${activeSessionId}`;
    
    sessionKeys.forEach(key => {
      if (!key.endsWith(activeSessionSuffix)) {
        storage.remove(key);
      }
    });
  },

  // Track active sessions for cleanup
  registerActiveSession: (sessionId: string): void => {
    const activeSessions = storage.get('crdt-active-sessions') || [];
    if (!activeSessions.includes(sessionId)) {
      activeSessions.push(sessionId);
      storage.set('crdt-active-sessions', activeSessions);
    }
  },

  unregisterActiveSession: (sessionId: string): void => {
    const activeSessions = storage.get('crdt-active-sessions') || [];
    const updatedSessions = activeSessions.filter((id: string) => id !== sessionId);
    storage.set('crdt-active-sessions', updatedSessions);
  },
};

/**
 * Get the current authentication token from session-scoped storage
 */
export function getAuthToken(): string | null {
  return storage.getSessionScoped('crdt-auth-token');
}

/**
 * Get the current user data from session-scoped storage
 */
export function getCurrentUser(): any {
  return storage.getSessionScoped('crdt-user-data');
}

/**
 * Create authenticated headers for API requests
 */
export function createAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  };
}

/**
 * Check if user is currently authenticated
 */
export function isAuthenticated(): boolean {
  const token = getAuthToken();
  const user = getCurrentUser();
  return !!(token && user && !isTokenExpired(token));
}