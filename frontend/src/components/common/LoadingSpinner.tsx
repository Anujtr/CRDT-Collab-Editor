import React from 'react';
import { cn } from '../../utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'primary' | 'white' | 'gray';
  text?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ 
  size = 'md', 
  className,
  color = 'primary',
  text,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const colorClasses = {
    primary: 'border-blue-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-400 border-t-transparent',
  };

  const spinner = (
    <div
      className={cn(
        'animate-spin rounded-full border-2',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
      role="status"
      aria-label="Loading"
      data-testid="loading-spinner"
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center z-50">
        <div className="text-center">
          {spinner}
          {text && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {text}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (text) {
    return (
      <div className="flex items-center gap-2">
        {spinner}
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {text}
        </span>
      </div>
    );
  }

  return spinner;
}

interface LoadingStateProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  className?: string;
}

export function LoadingState({ 
  isLoading, 
  children, 
  loadingComponent,
  className 
}: LoadingStateProps) {
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        {loadingComponent || <LoadingSpinner />}
      </div>
    );
  }

  return <>{children}</>;
}

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn('animate-pulse bg-gray-200 dark:bg-gray-700 rounded', className)} 
      data-testid="loading-skeleton"
    />
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  text?: string;
}

export function LoadingOverlay({ isLoading, children, text }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 flex items-center justify-center rounded-md">
          <div className="text-center">
            <LoadingSpinner />
            {text && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}