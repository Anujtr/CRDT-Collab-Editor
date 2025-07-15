const axios = require('axios');
const dotenv = require('dotenv');

// Set test environment and load test config
process.env.NODE_ENV = 'test';
dotenv.config({ path: '.env.test' });

const BASE_URL = 'http://localhost:8080';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test user factory
class TestUserFactory {
  static userCounter = 0;

  static createUser(role = 'editor') {
    this.userCounter++;
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substr(2, 5);
    return {
      username: `test${role}${this.userCounter}${timestamp}${random}`,
      password: 'TestPass123@',
      email: `test${this.userCounter}${timestamp}@example.com`,
      role: role
    };
  }

  static generateUniqueId() {
    return `test${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }

  static async registerUser(userData) {
    try {
      const response = await axios.post(`${BASE_URL}/api/auth/register`, userData);
      return {
        token: response.data.data.token,
        user: response.data.data.user,
        userData: userData
      };
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('already exists')) {
        // User already exists, try to login
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
          username: userData.username,
          password: userData.password
        });
        return {
          token: loginResponse.data.data.token,
          user: loginResponse.data.data.user,
          userData: userData
        };
      }
      throw error;
    }
  }

  static async createAndRegisterUser(role = 'editor') {
    const userData = this.createUser(role);
    return await this.registerUser(userData);
  }
}

// Test utilities
class TestUtils {
  static async waitForServer(maxAttempts = 30, intervalMs = 1000) {
    log('🔄 Waiting for server to be ready...', 'yellow');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`${BASE_URL}/api/health`);
        if (response.status === 200) {
          log('✅ Server is ready', 'green');
          return true;
        }
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error(`Server not ready after ${maxAttempts} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
    return false;
  }

  static async checkRateLimit() {
    try {
      const response = await axios.get(`${BASE_URL}/api/health`);
      const headers = response.headers;
      
      const rateLimitInfo = {
        limit: headers['ratelimit-limit'],
        remaining: headers['ratelimit-remaining'],
        reset: headers['ratelimit-reset']
      };
      
      if (rateLimitInfo.remaining && parseInt(rateLimitInfo.remaining) < 5) {
        log(`⚠️  Rate limit warning: ${rateLimitInfo.remaining} requests remaining`, 'yellow');
        return rateLimitInfo;
      }
      
      return rateLimitInfo;
    } catch (error) {
      return null;
    }
  }

  static async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retryWithDelay(fn, maxRetries = 3, delayMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.response?.status === 429 && i < maxRetries - 1) {
          log(`🔄 Rate limited, retrying in ${delayMs}ms... (${i + 1}/${maxRetries})`, 'yellow');
          await this.delay(delayMs);
          continue;
        }
        throw error;
      }
    }
  }

  static generateUniqueId() {
    return `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }

  static async cleanupTestData() {
    // In a real implementation, this would clean up test users from the database
    // For now, we'll just log that cleanup is happening
    log('🧹 Cleaning up test data...', 'blue');
  }
}

// Test environment validator
class TestEnvironmentValidator {
  static async validateEnvironment() {
    log('🔍 Validating test environment...', 'blue');
    
    const checks = [
      { name: 'Server Health', check: () => TestUtils.waitForServer() },
      { name: 'Environment Variables', check: () => this.checkEnvironmentVariables() },
      { name: 'Rate Limit Configuration', check: () => this.checkRateLimitConfig() }
    ];
    
    for (const { name, check } of checks) {
      try {
        await check();
        log(`✅ ${name}`, 'green');
      } catch (error) {
        log(`❌ ${name}: ${error.message}`, 'red');
        throw error;
      }
    }
    
    log('✅ Test environment validation completed', 'green');
  }

  static async checkEnvironmentVariables() {
    const required = ['JWT_SECRET'];
    const missing = required.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  static async checkRateLimitConfig() {
    // Check if we're in test mode
    if (process.env.NODE_ENV !== 'test') {
      log('⚠️  NODE_ENV is not set to "test" - rate limiting may interfere with tests', 'yellow');
    }
  }
}

// Enhanced test runner
class TestRunner {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  async runTest(name, testFn) {
    this.results.total++;
    log(`\n🧪 Running: ${name}`, 'blue');
    
    try {
      await testFn();
      this.results.passed++;
      log(`✅ ${name}`, 'green');
      this.results.details.push({ name, passed: true });
    } catch (error) {
      this.results.failed++;
      log(`❌ ${name}: ${error.message}`, 'red');
      this.results.details.push({ name, passed: false, error: error.message });
    }
  }

  async runTestSuite(name, tests) {
    log(`\n🚀 Running Test Suite: ${name}`, 'blue');
    
    for (const { name: testName, test } of tests) {
      await this.runTest(testName, test);
      // Small delay between tests to avoid rate limiting
      await TestUtils.delay(100);
    }
  }

  printSummary() {
    log('\n📊 Test Results Summary:', 'blue');
    log(`Total: ${this.results.total}`, 'blue');
    log(`Passed: ${this.results.passed}`, 'green');
    log(`Failed: ${this.results.failed}`, 'red');
    log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`, 'yellow');
    
    if (this.results.failed > 0) {
      log('\n❌ Failed Tests:', 'red');
      this.results.details
        .filter(test => !test.passed)
        .forEach(test => {
          log(`   • ${test.name}: ${test.error}`, 'red');
        });
    }
  }

  getResults() {
    return this.results;
  }
}

module.exports = {
  TestUserFactory,
  TestUtils,
  TestEnvironmentValidator,
  TestRunner,
  BASE_URL,
  colors,
  log
};