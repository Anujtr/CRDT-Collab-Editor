const axios = require('axios');
const { TestUserFactory, TestUtils, TestEnvironmentValidator, TestRunner, BASE_URL, colors, log } = require('../utils/test-utils');

// Set test environment
process.env.NODE_ENV = 'test';

let authToken = null;

async function testEndpoint(name, method, url, data = null, headers = {}) {
  try {
    log(`\n🧪 Testing: ${name}`, 'blue');
    
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    log(`✅ SUCCESS (${response.status}): ${name}`, 'green');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    if (error.response) {
      log(`❌ ERROR (${error.response.status}): ${name}`, 'red');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else {
      log(`❌ NETWORK ERROR: ${name}`, 'red');
      console.log(error.message);
    }
    return null;
  }
}

async function runTests() {
  const runner = new TestRunner();
  
  console.log('🚀 Starting Backend API Tests\n');
  
  // Validate test environment
  await TestEnvironmentValidator.validateEnvironment();
  
  // Test 1: Health Check
  await runner.runTest('Health Check', async () => {
    await testEndpoint('Health Check', 'GET', '/api/health');
  });
  
  // Test 2: Root Endpoint
  await runner.runTest('Root Endpoint', async () => {
    await testEndpoint('Root Endpoint', 'GET', '/');
  });
  
  // Test 3: User Registration
  await runner.runTest('User Registration', async () => {
    const userData = TestUserFactory.createUser('editor');
    const registerResponse = await TestUtils.retryWithDelay(
      () => testEndpoint('User Registration', 'POST', '/api/auth/register', userData)
    );
    
    if (registerResponse && registerResponse.data && registerResponse.data.token) {
      authToken = registerResponse.data.token;
      log(`🔑 Auth token saved for subsequent tests`, 'yellow');
    }
  });
  
  // Test 4: User Login
  await runner.runTest('User Login', async () => {
    const userData = TestUserFactory.createUser('editor');
    // First register the user
    await TestUtils.retryWithDelay(
      () => testEndpoint('User Registration for Login Test', 'POST', '/api/auth/register', userData)
    );
    
    // Then login
    const loginData = {
      username: userData.username,
      password: userData.password
    };
    
    const loginResponse = await TestUtils.retryWithDelay(
      () => testEndpoint('User Login', 'POST', '/api/auth/login', loginData)
    );
    
    if (loginResponse && loginResponse.data && loginResponse.data.token) {
      authToken = loginResponse.data.token;
    }
  });
  
  // Test 5: Get Current User (Protected Route)
  await runner.runTest('Get Current User (Protected)', async () => {
    if (authToken) {
      await testEndpoint(
        'Get Current User (Protected)',
        'GET',
        '/api/auth/me',
        null,
        { Authorization: `Bearer ${authToken}` }
      );
    } else {
      throw new Error('No auth token available');
    }
  });
  
  // Test 6: Invalid Login
  await runner.runTest('Invalid Login (Error Handling)', async () => {
    await testEndpoint(
      'Invalid Login (Testing Error Handling)',
      'POST',
      '/api/auth/login',
      {
        username: 'nonexistent',
        password: 'wrongpassword'
      }
    );
  });
  
  // Test 7: Protected Route Without Token
  await runner.runTest('Protected Route Without Token', async () => {
    await testEndpoint(
      'Protected Route Without Token (Testing Auth)',
      'GET',
      '/api/auth/me'
    );
  });
  
  // Test 8: Invalid Registration (Weak Password)
  await runner.runTest('Invalid Registration (Weak Password)', async () => {
    await testEndpoint(
      'Invalid Registration (Weak Password)',
      'POST',
      '/api/auth/register',
      {
        username: TestUserFactory.generateUniqueId(),
        password: 'weak',
        email: 'test@example.com',
        role: 'editor'
      }
    );
  });
  
  // Test 9: Invalid Registration (Invalid Email)
  await runner.runTest('Invalid Registration (Invalid Email)', async () => {
    await testEndpoint(
      'Invalid Registration (Invalid Email)',
      'POST',
      '/api/auth/register',
      {
        username: TestUserFactory.generateUniqueId(),
        password: 'TestPass123@',
        email: 'invalid-email',
        role: 'editor'
      }
    );
  });
  
  // Test 10: Rate Limiting Test (Multiple Rapid Requests)
  await runner.runTest('Rate Limiting Test', async () => {
    log('\n🔄 Testing Rate Limiting (Multiple Rapid Requests)', 'blue');
    let rateLimitHit = false;
    
    for (let i = 0; i < 3; i++) {
      try {
        await testEndpoint(
          `Rate Limit Test ${i + 1}`,
          'POST',
          '/api/auth/login',
          {
            username: 'nonexistent',
            password: 'wrongpassword'
          }
        );
      } catch (error) {
        if (error.response?.status === 429) {
          rateLimitHit = true;
          log(`✅ Rate limiting correctly activated on attempt ${i + 1}`, 'green');
          break;
        }
      }
    }
    
    if (!rateLimitHit) {
      log('⚠️  Rate limiting may not be working as expected', 'yellow');
    }
  });
  
  // Test 11: Logout
  await runner.runTest('User Logout', async () => {
    if (authToken) {
      await testEndpoint(
        'User Logout',
        'POST',
        '/api/auth/logout',
        null,
        { Authorization: `Bearer ${authToken}` }
      );
    } else {
      throw new Error('No auth token available for logout test');
    }
  });
  
  // Print summary
  runner.printSummary();
  
  console.log('\n🎉 API Tests Completed!');
  console.log('\n📝 Next Steps:');
  console.log('1. Test WebSocket functionality with: node test-websocket.js');
  console.log('2. Update the JWT token in test-websocket.js with a token from above');
  console.log('3. Start multiple instances of the WebSocket test to see real-time updates');
  
  return runner.getResults();
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Tests interrupted by user');
  process.exit(0);
});

// Run tests
runTests().catch(error => {
  console.error('🚨 Test runner error:', error.message);
  process.exit(1);
});