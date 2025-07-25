import React from 'react';
import { DocumentList } from '../documents/DocumentList';

export function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <DocumentList />
    </div>
  );
}