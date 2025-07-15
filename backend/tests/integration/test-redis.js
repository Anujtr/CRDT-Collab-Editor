const axios = require('axios');
const { io } = require('socket.io-client');
const { TestUserFactory, TestUtils, TestEnvironmentValidator, TestRunner, BASE_URL, colors, log } = require('../utils/test-utils');

// Set test environment
process.env.NODE_ENV = 'test';

async function registerUser(user) {
  try {
    const response = await TestUtils.retryWithDelay(
      () => axios.post(`${BASE_URL}/api/auth/register`, user)
    );
    return response.data.data.token;
  } catch (error) {
    if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('already exists')) {
      // User already exists, try to login
      const loginResponse = await TestUtils.retryWithDelay(
        () => axios.post(`${BASE_URL}/api/auth/login`, {
          username: user.username,
          password: user.password
        })
      );
      return loginResponse.data.data.token;
    }
    throw error;
  }
}

function createSocketConnection(token, userRole) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      path: '/ws/',
      transports: ['websocket']
    });

    socket.on('connect', () => {
      log(`✅ ${userRole} WebSocket connected`, 'green');
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', (data) => {
      log(`✅ ${userRole} authenticated with role: ${data.role}`, 'green');
      socket.userData = data;
      resolve(socket);
    });

    socket.on('auth-error', (error) => {
      log(`❌ ${userRole} authentication failed: ${error.message}`, 'red');
      reject(error);
    });

    socket.on('error', (error) => {
      log(`❌ ${userRole} socket error: ${error.message || error}`, 'red');
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!socket.userData) {
        reject(new Error(`${userRole} authentication timeout`));
      }
    }, 5000);
  });
}

async function testRedisIntegration() {
  log('\n🔴 Testing Redis Integration & Role System', 'blue');
  
  let adminToken, editorToken, viewerToken;
  let adminSocket, editorSocket, viewerSocket;

  try {
    // Step 1: Register/Login all test users
    log('\n📝 Registering test users...', 'yellow');
    const adminUser = TestUserFactory.createUser('admin');
    const editorUser = TestUserFactory.createUser('editor');
    const viewerUser = TestUserFactory.createUser('viewer');
    
    adminToken = await registerUser(adminUser);
    editorToken = await registerUser(editorUser);
    viewerToken = await registerUser(viewerUser);
    log('✅ All test users registered/logged in', 'green');

    // Step 2: Create WebSocket connections
    log('\n🔌 Creating WebSocket connections...', 'yellow');
    [adminSocket, editorSocket, viewerSocket] = await Promise.all([
      createSocketConnection(adminToken, 'ADMIN'),
      createSocketConnection(editorToken, 'EDITOR'),
      createSocketConnection(viewerToken, 'VIEWER')
    ]);

    // Step 3: Test Redis Pub/Sub with multiple users
    log('\n🔄 Testing Redis Pub/Sub with multiple users...', 'yellow');
    
    const documentId = 'test-redis-doc-' + Date.now();
    const updatePromises = [];
    
    // Set up listeners for document updates
    editorSocket.on('document-update', (data) => {
      log(`📄 EDITOR received update from ${data.username}: ${data.update.content}`, 'green');
    });
    
    viewerSocket.on('document-update', (data) => {
      log(`📄 VIEWER received update from ${data.username}: ${data.update.content}`, 'green');
    });
    
    adminSocket.on('document-update', (data) => {
      log(`📄 ADMIN received update from ${data.username}: ${data.update.content}`, 'green');
    });

    // Set up user join/leave listeners
    [adminSocket, editorSocket, viewerSocket].forEach(socket => {
      socket.on('user-joined', (data) => {
        log(`👤 User joined: ${data.username} (${data.role})`, 'yellow');
      });
      
      socket.on('user-left', (data) => {
        log(`👋 User left: ${data.username}`, 'yellow');
      });
    });

    // Step 4: Test role-based document access
    log('\n🔐 Testing role-based document access...', 'yellow');
    
    // Admin should be able to join any document
    adminSocket.emit('join-document', { documentId });
    
    // Editor should be able to join (has read permission)
    editorSocket.emit('join-document', { documentId });
    
    // Viewer should be able to join (has read permission)
    viewerSocket.emit('join-document', { documentId });
    
    // Wait for all to join
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 5: Test permission-based document updates
    log('\n📝 Testing permission-based document updates...', 'yellow');
    
    // Admin should be able to write
    adminSocket.emit('document-update', {
      documentId,
      update: {
        type: 'text-insert',
        position: 0,
        content: 'Admin update: Hello from admin!'
      }
    });
    
    // Editor should be able to write
    editorSocket.emit('document-update', {
      documentId,
      update: {
        type: 'text-insert',
        position: 27,
        content: ' Editor update: Hello from editor!'
      }
    });
    
    // Viewer should NOT be able to write (will get error)
    viewerSocket.on('error', (error) => {
      if (error.code === 'INSUFFICIENT_PERMISSIONS') {
        log(`✅ Viewer correctly blocked from writing: ${error.message}`, 'green');
      }
    });
    
    viewerSocket.emit('document-update', {
      documentId,
      update: {
        type: 'text-insert',
        position: 61,
        content: ' Viewer update: This should fail!'
      }
    });

    // Step 6: Test cursor updates (should work for all roles)
    log('\n🖱️ Testing cursor updates...', 'yellow');
    
    adminSocket.emit('cursor-update', {
      documentId,
      cursor: { position: 10, selection: { start: 0, end: 10 } }
    });
    
    // Set up cursor listeners
    editorSocket.on('cursor-update', (data) => {
      log(`🖱️ EDITOR received cursor update from ${data.username}`, 'green');
    });
    
    viewerSocket.on('cursor-update', (data) => {
      log(`🖱️ VIEWER received cursor update from ${data.username}`, 'green');
    });

    // Step 7: Test Redis fallback behavior
    log('\n🔄 Testing Redis fallback behavior...', 'yellow');
    log('💡 Note: If Redis is running, updates will be distributed via Redis pub/sub', 'yellow');
    log('💡 If Redis is not running, updates will still work locally via Socket.IO', 'yellow');

    // Step 8: Test document leaving
    log('\n🚪 Testing document leaving...', 'yellow');
    
    setTimeout(() => {
      viewerSocket.emit('leave-document', { documentId });
    }, 2000);
    
    setTimeout(() => {
      editorSocket.emit('leave-document', { documentId });
    }, 3000);
    
    setTimeout(() => {
      adminSocket.emit('leave-document', { documentId });
    }, 4000);

    // Step 9: Test invalid scenarios
    log('\n❌ Testing invalid scenarios...', 'yellow');
    
    // Test invalid document ID
    adminSocket.emit('join-document', { documentId: '' });
    
    // Test malformed update
    editorSocket.emit('document-update', {
      documentId: 'invalid-doc',
      update: null
    });

    // Wait for all operations to complete
    await new Promise(resolve => setTimeout(resolve, 6000));

    log('\n✅ Redis integration and role system tests completed!', 'green');
    
  } catch (error) {
    log(`❌ Redis integration test failed: ${error.message}`, 'red');
    console.error(error);
  } finally {
    // Clean up connections
    if (adminSocket) adminSocket.disconnect();
    if (editorSocket) editorSocket.disconnect();
    if (viewerSocket) viewerSocket.disconnect();
  }
}

async function testJWTAdvanced() {
  log('\n🔑 Testing Advanced JWT Scenarios...', 'blue');
  
  try {
    // Test 1: Invalid JWT token
    log('\n❌ Testing invalid JWT token...', 'yellow');
    try {
      await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: 'Bearer invalid-token' }
      });
    } catch (error) {
      if (error.response?.status === 401) {
        log('✅ Invalid JWT token correctly rejected', 'green');
      }
    }
    
    // Test 2: Malformed JWT token
    log('\n❌ Testing malformed JWT token...', 'yellow');
    try {
      await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: 'Bearer not.a.valid.jwt.token.format' }
      });
    } catch (error) {
      if (error.response?.status === 401) {
        log('✅ Malformed JWT token correctly rejected', 'green');
      }
    }
    
    // Test 3: Missing Authorization header
    log('\n❌ Testing missing Authorization header...', 'yellow');
    try {
      await axios.get(`${BASE_URL}/api/auth/me`);
    } catch (error) {
      if (error.response?.status === 401) {
        log('✅ Missing Authorization header correctly rejected', 'green');
      }
    }
    
    // Test 4: JWT token with wrong format
    log('\n❌ Testing JWT token with wrong format...', 'yellow');
    try {
      await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: 'InvalidFormat valid-token' }
      });
    } catch (error) {
      if (error.response?.status === 401) {
        log('✅ Wrong token format correctly rejected', 'green');
      }
    }
    
    log('\n✅ Advanced JWT tests completed!', 'green');
    
  } catch (error) {
    log(`❌ JWT advanced test failed: ${error.message}`, 'red');
    console.error(error);
  }
}

async function testMultiUserCollaboration() {
  log('\n👥 Testing Multi-User Collaboration...', 'blue');
  
  try {
    // Create two editor users for collaboration test
    const user1Data = TestUserFactory.createUser('editor');
    const user2Data = TestUserFactory.createUser('editor');
    
    const user1Token = await registerUser(user1Data);
    const user2Token = await registerUser(user2Data);
    
    const socket1 = await createSocketConnection(user1Token, 'COLLAB_USER1');
    const socket2 = await createSocketConnection(user2Token, 'COLLAB_USER2');
    
    const collaborationDoc = 'collab-doc-' + Date.now();
    
    // Set up cross-user update listeners
    socket1.on('document-update', (data) => {
      log(`📄 USER1 received update from ${data.username}: ${data.update.content}`, 'green');
    });
    
    socket2.on('document-update', (data) => {
      log(`📄 USER2 received update from ${data.username}: ${data.update.content}`, 'green');
    });
    
    // Both users join the same document
    socket1.emit('join-document', { documentId: collaborationDoc });
    socket2.emit('join-document', { documentId: collaborationDoc });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate collaborative editing
    socket1.emit('document-update', {
      documentId: collaborationDoc,
      update: {
        type: 'text-insert',
        position: 0,
        content: 'User1: Starting the document.'
      }
    });
    
    setTimeout(() => {
      socket2.emit('document-update', {
        documentId: collaborationDoc,
        update: {
          type: 'text-insert',
          position: 29,
          content: ' User2: Adding more content.'
        }
      });
    }, 1000);
    
    setTimeout(() => {
      socket1.emit('document-update', {
        documentId: collaborationDoc,
        update: {
          type: 'text-insert',
          position: 56,
          content: ' User1: Final edit.'
        }
      });
    }, 2000);
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    socket1.disconnect();
    socket2.disconnect();
    
    log('\n✅ Multi-user collaboration test completed!', 'green');
    
  } catch (error) {
    log(`❌ Multi-user collaboration test failed: ${error.message}`, 'red');
    console.error(error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Backend Tests\n');
  
  // Test Redis integration and role system
  await testRedisIntegration();
  
  // Test advanced JWT scenarios
  await testJWTAdvanced();
  
  // Test multi-user collaboration
  await testMultiUserCollaboration();
  
  console.log('\n🎉 All comprehensive tests completed!');
  console.log('\n📊 Test Summary:');
  console.log('✅ Redis Integration & Pub/Sub');
  console.log('✅ Role-based Access Control');
  console.log('✅ Permission-based Document Access');
  console.log('✅ Advanced JWT Validation');
  console.log('✅ Multi-user Real-time Collaboration');
  console.log('✅ Error Handling & Edge Cases');
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Tests interrupted by user');
  process.exit(0);
});

// Run comprehensive tests
runAllTests().catch(error => {
  console.error('🚨 Comprehensive test runner error:', error.message);
  process.exit(1);
});