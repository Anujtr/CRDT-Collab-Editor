/**
 * Cache busting utilities for development
 */

// Add timestamp to URLs to prevent caching during development
export const addCacheBuster = (url: string): string => {
  if (process.env.NODE_ENV === 'development') {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_t=${Date.now()}`;
  }
  return url;
};

// Configure fetch to disable caching in development
export const developmentFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  const cacheBustedUrl = addCacheBuster(url);
  
  const developmentOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      ...(process.env.NODE_ENV === 'development' && {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }),
    },
  };

  return fetch(cacheBustedUrl, developmentOptions);
};

// Disable service worker in development
export const disableServiceWorkerInDev = (): void => {
  if (process.env.NODE_ENV === 'development' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }
};

// Force reload stylesheets in development
export const forceReloadStylesheets = (): void => {
  if (process.env.NODE_ENV === 'development') {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((link: any) => {
      const href = link.href;
      const newHref = addCacheBuster(href);
      if (href !== newHref) {
        link.href = newHref;
      }
    });
  }
};