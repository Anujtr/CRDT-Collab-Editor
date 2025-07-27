const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // API proxy - only proxy /api routes to backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      headers: {
        // Disable caching for proxied requests in development
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  );

  // WebSocket proxy - only proxy /ws routes to backend
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      ws: true,
      changeOrigin: true,
    })
  );

  // Add cache-busting headers for development (but don't proxy everything)
  app.use((req, res, next) => {
    // Skip webpack dev server files and static assets
    const isWebpackFile = req.url.includes('.hot-update.') || 
                         req.url.includes('webpack') ||
                         req.url.endsWith('.js') ||
                         req.url.endsWith('.css') ||
                         req.url.endsWith('.map') ||
                         req.url.includes('static/');
    
    if (!isWebpackFile && process.env.NODE_ENV === 'development') {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString(),
      });
    }
    next();
  });
};