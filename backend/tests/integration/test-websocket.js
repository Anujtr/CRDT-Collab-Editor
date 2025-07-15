const { io } = require('socket.io-client');

// Replace this with your actual JWT token from registration/login
const token = 'YOUR_JWT_TOKEN_HERE';

console.log('🔗 Connecting to WebSocket server...');

const socket = io('http://localhost:8080', {
  path: '/ws/',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  console.log('🔐 Authenticating with JWT token...');
  
  // Authenticate with JWT token
  socket.emit('authenticate', { token });
});

socket.on('authenticated', (data) => {
  console.log('✅ Authentication successful!');
  console.log('👤 User info:', {
    userId: data.userId,
    username: data.username,
    role: data.role,
    permissions: data.permissions
  });
  
  console.log('📄 Joining test document...');
  
  // Join a test document
  socket.emit('join-document', { documentId: 'test-doc-123' });
});

socket.on('document-joined', (data) => {
  console.log('✅ Successfully joined document:', data.documentId);
  console.log('👥 Current users in document:', data.users.length);
  
  console.log('📝 Sending test document update...');
  
  // Send a test document update
  socket.emit('document-update', {
    documentId: 'test-doc-123',
    update: {
      type: 'text-insert',
      position: 0,
      content: 'Hello World from WebSocket test!'
    }
  });
  
  console.log('🖱️ Sending cursor update...');
  
  // Send cursor update
  socket.emit('cursor-update', {
    documentId: 'test-doc-123',
    cursor: {
      position: 5,
      selection: { start: 0, end: 5 }
    }
  });
});

socket.on('document-update', (data) => {
  console.log('📄 Received document update:', {
    documentId: data.documentId,
    userId: data.userId,
    username: data.username,
    updateType: data.update.type,
    content: data.update.content,
    timestamp: new Date(data.timestamp).toLocaleTimeString()
  });
});

socket.on('cursor-update', (data) => {
  console.log('🖱️ Received cursor update from:', data.username, data.cursor);
});

socket.on('user-joined', (data) => {
  console.log('👤 User joined document:', data.username, '(Role:', data.role + ')');
});

socket.on('user-left', (data) => {
  console.log('👋 User left document:', data.username);
});

socket.on('auth-error', (error) => {
  console.error('❌ Authentication error:', error.message);
  console.error('💡 Make sure you have a valid JWT token');
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error.message || error);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected from server:', reason);
});

// Test various document operations
setTimeout(() => {
  if (socket.connected) {
    console.log('📝 Sending another document update...');
    socket.emit('document-update', {
      documentId: 'test-doc-123',
      update: {
        type: 'text-insert',
        position: 31,
        content: ' This is a second update!'
      }
    });
  }
}, 2000);

// Leave document after 6 seconds
setTimeout(() => {
  if (socket.connected) {
    console.log('🚪 Leaving document...');
    socket.emit('leave-document', { documentId: 'test-doc-123' });
  }
}, 6000);

// Disconnect after 10 seconds
setTimeout(() => {
  console.log('🔌 Disconnecting...');
  socket.disconnect();
  console.log('✅ WebSocket test completed!');
  process.exit(0);
}, 10000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  socket.disconnect();
  process.exit(0);
});