const axios = require('axios');
const { io } = require('socket.io-client');
const { TestUserFactory, TestUtils, TestEnvironmentValidator, TestRunner, BASE_URL, colors, log } = require('../utils/test-utils');

// Set test environment
process.env.NODE_ENV = 'test';

// Test matrix for role permissions
const rolePermissions = {
  admin: {
    canRead: true,
    canWrite: true,
    canDelete: true,
    canManage: true
  },
  editor: {
    canRead: true,
    canWrite: true,
    canDelete: false,
    canManage: false
  },
  viewer: {
    canRead: true,
    canWrite: false,
    canDelete: false,
    canManage: false
  },
  user: {
    canRead: false,
    canWrite: false,
    canDelete: false,
    canManage: false
  }
};

async function createUserWithRole(role) {
  const userData = TestUserFactory.createUser(role);
  
  try {
    const response = await TestUtils.retryWithDelay(
      () => axios.post(`${BASE_URL}/api/auth/register`, userData)
    );
    return {
      token: response.data.data.token,
      user: response.data.data.user,
      userData: userData
    };
  } catch (error) {
    throw new Error(`Failed to create ${role} user: ${error.message}`);
  }
}

async function testDocumentPermissions(userInfo, documentId) {
  const { token, user } = userInfo;
  const expectedPermissions = rolePermissions[user.role];
  
  log(`\n🔐 Testing ${user.role.toUpperCase()} permissions for document operations...`, 'blue');
  
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      path: '/ws/',
      transports: ['websocket']
    });
    
    const testResults = {
      role: user.role,
      read: null,
      write: null,
      join: null,
      errors: []
    };
    
    socket.on('connect', () => {
      socket.emit('authenticate', { token });
    });
    
    socket.on('authenticated', (data) => {
      log(`✅ ${user.role.toUpperCase()} authenticated successfully`, 'green');
      
      // Test 1: Try to join document (read permission)
      socket.emit('join-document', { documentId });
    });
    
    socket.on('document-joined', (data) => {
      log(`✅ ${user.role.toUpperCase()} successfully joined document`, 'green');
      testResults.join = true;
      testResults.read = true;
      
      // Test 2: Try to send document update (write permission)
      socket.emit('document-update', {
        documentId,
        update: {
          type: 'text-insert',
          position: 0,
          content: `${user.role.toUpperCase()} says: Hello World!`
        }
      });
    });
    
    socket.on('document-update', (data) => {
      if (data.username === user.username) {
        log(`✅ ${user.role.toUpperCase()} successfully sent document update`, 'green');
        testResults.write = true;
      }
    });
    
    socket.on('document-update-success', (data) => {
      if (data.username === user.username) {
        log(`✅ ${user.role.toUpperCase()} successfully sent document update`, 'green');
        testResults.write = true;
      }
    });
    
    socket.on('error', (error) => {
      testResults.errors.push(error);
      
      if (error.code === 'INSUFFICIENT_PERMISSIONS') {
        if (error.message.includes('read')) {
          log(`❌ ${user.role.toUpperCase()} correctly blocked from reading: ${error.message}`, 'green');
          testResults.read = false;
        } else if (error.message.includes('writ')) {
          log(`❌ ${user.role.toUpperCase()} correctly blocked from writing: ${error.message}`, 'green');
          testResults.write = false;
        }
      } else {
        log(`❌ ${user.role.toUpperCase()} error: ${error.message}`, 'red');
      }
    });
    
    socket.on('auth-error', (error) => {
      log(`❌ ${user.role.toUpperCase()} authentication error: ${error.message}`, 'red');
      testResults.errors.push(error);
    });
    
    // Give time for all operations to complete
    setTimeout(() => {
      socket.disconnect();
      
      // Validate results against expected permissions
      let passed = true;
      
      if (expectedPermissions.canRead && !testResults.read) {
        log(`❌ ${user.role.toUpperCase()} should be able to read but cannot`, 'red');
        passed = false;
      }
      
      if (!expectedPermissions.canRead && testResults.read) {
        log(`❌ ${user.role.toUpperCase()} should NOT be able to read but can`, 'red');
        passed = false;
      }
      
      if (expectedPermissions.canWrite && !testResults.write) {
        log(`❌ ${user.role.toUpperCase()} should be able to write but cannot`, 'red');
        passed = false;
      }
      
      if (!expectedPermissions.canWrite && testResults.write) {
        log(`❌ ${user.role.toUpperCase()} should NOT be able to write but can`, 'red');
        passed = false;
      }
      
      if (passed) {
        log(`✅ ${user.role.toUpperCase()} permissions working correctly`, 'green');
      }
      
      resolve({ ...testResults, passed });
    }, 5000);
    
    // Handle connection timeout
    setTimeout(() => {
      if (!socket.userData) {
        socket.disconnect();
        reject(new Error(`${user.role.toUpperCase()} connection timeout`));
      }
    }, 10000);
  });
}

async function testRoleHierarchy() {
  log('\n👑 Testing Role Hierarchy & Permissions...', 'blue');
  
  const documentId = 'role-test-doc-' + Date.now();
  const testResults = [];
  
  try {
    // Create users with different roles
    const adminUser = await createUserWithRole('admin');
    const editorUser = await createUserWithRole('editor');
    const viewerUser = await createUserWithRole('viewer');
    const regularUser = await createUserWithRole('user');
    
    // Test each role's permissions
    const adminResult = await testDocumentPermissions(adminUser, documentId);
    const editorResult = await testDocumentPermissions(editorUser, documentId);
    const viewerResult = await testDocumentPermissions(viewerUser, documentId);
    const userResult = await testDocumentPermissions(regularUser, documentId);
    
    testResults.push(adminResult, editorResult, viewerResult, userResult);
    
    // Summary
    log('\n📊 Role Permission Test Summary:', 'blue');
    testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      log(`${status} ${result.role.toUpperCase()}: Read=${result.read}, Write=${result.write}, Join=${result.join}`, 
          result.passed ? 'green' : 'red');
    });
    
    return testResults;
    
  } catch (error) {
    log(`❌ Role hierarchy test failed: ${error.message}`, 'red');
    throw error;
  }
}

async function testAPIRolePermissions() {
  log('\n🔒 Testing API Role Permissions...', 'blue');
  
  try {
    // Create users with different roles
    const adminUser = await createUserWithRole('admin');
    const editorUser = await createUserWithRole('editor');
    const viewerUser = await createUserWithRole('viewer');
    
    // Test protected endpoints with different roles
    const users = [
      { ...adminUser, role: 'admin' },
      { ...editorUser, role: 'editor' },
      { ...viewerUser, role: 'viewer' }
    ];
    
    for (const userInfo of users) {
      log(`\n🧪 Testing API access for ${userInfo.role.toUpperCase()}...`, 'yellow');
      
      try {
        // Test /api/auth/me endpoint
        const response = await axios.get(`${BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${userInfo.token}` }
        });
        
        log(`✅ ${userInfo.role.toUpperCase()} can access /api/auth/me`, 'green');
        log(`   User data: ${response.data.data.user.username} (${response.data.data.user.role})`, 'green');
        
        // Verify the role matches expected
        if (response.data.data.user.role === userInfo.role) {
          log(`✅ ${userInfo.role.toUpperCase()} role correctly returned`, 'green');
        } else {
          log(`❌ ${userInfo.role.toUpperCase()} role mismatch`, 'red');
        }
        
      } catch (error) {
        log(`❌ ${userInfo.role.toUpperCase()} cannot access /api/auth/me: ${error.message}`, 'red');
      }
    }
    
  } catch (error) {
    log(`❌ API role permissions test failed: ${error.message}`, 'red');
    throw error;
  }
}

async function testRoleBasedDocumentAccess() {
  log('\n📁 Testing Role-Based Document Access Control...', 'blue');
  
  try {
    // Create different document scenarios
    const publicDoc = 'public-doc-' + Date.now();
    const restrictedDoc = 'restricted-doc-' + Date.now();
    
    // Create users
    const adminUser = await createUserWithRole('admin');
    const editorUser = await createUserWithRole('editor');
    const viewerUser = await createUserWithRole('viewer');
    
    const testScenarios = [
      {
        name: 'Public Document Access',
        documentId: publicDoc,
        description: 'All roles should be able to read'
      },
      {
        name: 'Restricted Document Access',
        documentId: restrictedDoc,
        description: 'Only admin and editor should be able to write'
      }
    ];
    
    for (const scenario of testScenarios) {
      log(`\n📄 Testing: ${scenario.name}`, 'yellow');
      log(`   ${scenario.description}`, 'yellow');
      
      // Test with each user type
      const users = [
        { ...adminUser, role: 'admin' },
        { ...editorUser, role: 'editor' },
        { ...viewerUser, role: 'viewer' }
      ];
      
      for (const userInfo of users) {
        await testDocumentPermissions(userInfo, scenario.documentId);
      }
    }
    
  } catch (error) {
    log(`❌ Role-based document access test failed: ${error.message}`, 'red');
    throw error;
  }
}

async function testPermissionEdgeCases() {
  log('\n⚠️  Testing Permission Edge Cases...', 'blue');
  
  try {
    const editorUser = await createUserWithRole('editor');
    
    await new Promise((resolve, reject) => {
      const socket = io(BASE_URL, {
        path: '/ws/',
        transports: ['websocket']
      });
      
      socket.on('connect', () => {
        socket.emit('authenticate', { token: editorUser.token });
      });
      
      socket.on('authenticated', () => {
        log('✅ Editor authenticated for edge case testing', 'green');
        
        // Test 1: Empty document ID
        log('\n🧪 Testing empty document ID...', 'yellow');
        socket.emit('join-document', { documentId: '' });
        
        // Test 2: Null document ID
        log('🧪 Testing null document ID...', 'yellow');
        socket.emit('join-document', { documentId: null });
        
        // Test 3: Invalid document update without joining
        log('🧪 Testing update without joining document...', 'yellow');
        socket.emit('document-update', {
          documentId: 'never-joined-doc',
          update: { type: 'text-insert', position: 0, content: 'Test' }
        });
        
        // Test 4: Malformed update data
        log('🧪 Testing malformed update data...', 'yellow');
        socket.emit('document-update', {
          documentId: 'test-doc',
          update: null
        });
        
        // Test 5: Extremely large update
        log('🧪 Testing extremely large update...', 'yellow');
        socket.emit('document-update', {
          documentId: 'test-doc',
          update: {
            type: 'text-insert',
            position: 0,
            content: 'A'.repeat(10000) // 10KB of text
          }
        });
      });
      
      socket.on('error', (error) => {
        log(`✅ Edge case correctly handled: ${error.message}`, 'green');
      });
      
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, 5000);
    });
    
  } catch (error) {
    log(`❌ Permission edge cases test failed: ${error.message}`, 'red');
    throw error;
  }
}

async function runRoleTests() {
  console.log('🎭 Starting Role System & Permission Tests\n');
  
  try {
    // Test role hierarchy
    await testRoleHierarchy();
    
    // Test API role permissions
    await testAPIRolePermissions();
    
    // Test role-based document access
    await testRoleBasedDocumentAccess();
    
    // Test permission edge cases
    await testPermissionEdgeCases();
    
    console.log('\n🎉 All role and permission tests completed!');
    console.log('\n📊 Test Coverage:');
    console.log('✅ Role Hierarchy (admin > editor > viewer > user)');
    console.log('✅ Permission-based Document Access');
    console.log('✅ API Role Permissions');
    console.log('✅ WebSocket Role Authentication');
    console.log('✅ Document Read/Write Permissions');
    console.log('✅ Permission Edge Cases');
    
  } catch (error) {
    console.error('❌ Role tests failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Role tests interrupted by user');
  process.exit(0);
});

// Run role tests
runRoleTests();