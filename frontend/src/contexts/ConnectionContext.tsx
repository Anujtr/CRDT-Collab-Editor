import React, { createContext, useContext, ReactNode } from 'react';
import { useConnection } from '../hooks/useConnection';
import { ConnectionState } from '../types';

interface ConnectionContextValue {
  connectionState: ConnectionState;
  connect: () => Promise<void>;
  disconnect: () => void;
  setExternalConnectionState: (updates: Partial<ConnectionState>) => void;
  isConnected: boolean;
  isAuthenticated: boolean;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function useGlobalConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useGlobalConnection must be used within a ConnectionProvider');
  }
  return context;
}

interface ConnectionProviderProps {
  children: ReactNode;
}

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const connection = useConnection({
    autoConnect: false,
    externalStatusUpdates: true, // Allow external systems to control the status
    maxRetries: 5,
    retryDelay: 1000,
  });

  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}