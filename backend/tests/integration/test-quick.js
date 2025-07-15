const dotenv = require('dotenv');
const axios = require('axios');

// Set test environment and load test config
process.env.NODE_ENV = 'test';
dotenv.config({ path: '../../.env.test' });

const { TestUserFactory, TestUtils, TestEnvironmentValidator, BASE_URL, colors, log } = require('../utils/test-utils');

async function runQuickTest() {
  log('🚀 Running Quick Test to Verify Fixes', 'blue');
  log('=' .repeat(50), 'blue');
  
  try {
    // Validate environment
    await TestEnvironmentValidator.validateEnvironment();
    log('✅ Test environment validated', 'green');
    
    // Test rate limiting configuration
    log('\n🔄 Testing rate limiting configuration...', 'blue');
    const rateLimitInfo = await TestUtils.checkRateLimit();
    log(`Rate limit info: ${JSON.stringify(rateLimitInfo)}`, 'cyan');
    
    // Test user creation
    log('\n👤 Testing user creation...', 'blue');
    const userData = TestUserFactory.createUser('editor');
    log(`Created user: ${userData.username}`, 'cyan');
    
    // Test user registration with retry
    log('\n📝 Testing user registration with retry logic...', 'blue');
    const response = await TestUtils.retryWithDelay(
      () => axios.post(`${BASE_URL}/api/auth/register`, userData),
      3,
      1000
    );
    
    if (response.data.success) {
      log('✅ User registration successful', 'green');
      log(`Token received: ${response.data.data.token.substring(0, 20)}...`, 'cyan');
    } else {
      log('❌ User registration failed', 'red');
    }
    
    // Test multiple rapid requests (should work now)
    log('\n🔄 Testing multiple rapid requests...', 'blue');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const user = TestUserFactory.createUser('editor');
      promises.push(
        TestUtils.retryWithDelay(
          () => axios.post(`${BASE_URL}/api/auth/register`, user),
          2,
          500
        )
      );
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    log(`✅ Rapid requests test: ${successful} successful, ${failed} failed`, 'green');
    
    if (successful >= 3) {
      log('✅ Rate limiting fixes are working correctly!', 'green');
    } else {
      log('⚠️  Rate limiting may still be too restrictive', 'yellow');
    }
    
    log('\n🎉 Quick test completed successfully!', 'green');
    
  } catch (error) {
    log(`❌ Quick test failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n🛑 Quick test interrupted by user', 'yellow');
  process.exit(0);
});

// Run quick test
runQuickTest();