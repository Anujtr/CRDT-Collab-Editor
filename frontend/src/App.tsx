import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './providers/AuthProvider';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/common/Layout';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { DashboardPage } from './components/common/DashboardPage';
import { EditorPage } from './components/editor/EditorPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { disableServiceWorkerInDev } from './utils/cacheBuster';
import './styles/globals.css';

function App() {
  // Disable caching and service worker in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      disableServiceWorkerInDev();
      
      // Add cache-busting only for static assets, not API calls
      if (typeof window !== 'undefined') {
        const originalFetch = window.fetch;
        window.fetch = (url: any, options: any = {}) => {
          // Only apply cache-busting to static assets, not API calls
          if (typeof url === 'string' && 
              url.startsWith('/') && 
              !url.startsWith('/api') && 
              !url.startsWith('/ws') &&
              (url.includes('.js') || url.includes('.css') || url.includes('.html'))) {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}_t=${Date.now()}`;
          }
          
          // Don't add cache headers to API requests
          if (typeof url === 'string' && (url.includes('/api') || url.includes('localhost:8080'))) {
            return originalFetch(url, options);
          }
          
          return originalFetch(url, {
            ...options,
            headers: {
              ...options.headers,
              ...(typeof url === 'string' && !url.includes('/api') && {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
              }),
            },
          });
        };
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConnectionProvider>
          <Router>
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
                path="/document/:documentId"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <EditorPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              
              {/* Fallback redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            
            {/* Global toast notifications */}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                className: 'backdrop-blur-sm',
                style: {
                  background: 'rgb(255 255 255 / 0.9)',
                  color: '#1f2937',
                  border: '1px solid rgb(229 231 235)',
                  borderRadius: '0.75rem',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#059669',
                    secondary: '#fff',
                  },
                  style: {
                    background: 'rgb(240 253 244 / 0.9)',
                    color: '#065f46',
                    border: '1px solid rgb(167 243 208)',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#dc2626',
                    secondary: '#fff',
                  },
                  style: {
                    background: 'rgb(254 242 242 / 0.9)',
                    color: '#991b1b',
                    border: '1px solid rgb(254 202 202)',
                  },
                },
              }}
            />
          </div>
          </Router>
        </ConnectionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;