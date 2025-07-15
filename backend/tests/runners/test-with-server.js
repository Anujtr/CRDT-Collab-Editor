#!/usr/bin/env node

const { spawn } = require('child_process');
const { TestUtils, colors, log } = require('../utils/test-utils');

// Set test environment
process.env.NODE_ENV = 'test';

let serverProcess = null;

async function startTestServer() {
  log('🚀 Starting test server...', 'blue');
  
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['start-test-server.js'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    let serverOutput = '';
    
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
      if (serverOutput.includes('Server running on port')) {
        log('✅ Test server started successfully', 'green');
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    serverProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Test server exited with code ${code}`));
      }
    });
    
    serverProcess.on('error', (error) => {
      reject(error);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        reject(new Error('Test server startup timeout'));
      }
    }, 30000);
  });
}

async function stopTestServer() {
  if (serverProcess && !serverProcess.killed) {
    log('🛑 Stopping test server...', 'yellow');
    serverProcess.kill('SIGINT');
    
    // Wait for graceful shutdown
    await new Promise((resolve) => {
      serverProcess.on('close', resolve);
      setTimeout(resolve, 5000); // Force close after 5 seconds
    });
  }
}

async function runTestsWithServer() {
  try {
    // Start test server
    await startTestServer();
    
    // Wait for server to be fully ready
    await TestUtils.waitForServer(30, 1000);
    
    // Run tests
    log('\n🧪 Running tests...', 'blue');
    
    const testProcess = spawn('node', ['run-all-tests.js'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    return new Promise((resolve, reject) => {
      testProcess.on('close', (code) => {
        resolve(code);
      });
      
      testProcess.on('error', (error) => {
        reject(error);
      });
    });
    
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    return 1;
  } finally {
    await stopTestServer();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  log('\n🛑 Test interrupted by user', 'yellow');
  await stopTestServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\n🛑 Test terminated', 'yellow');
  await stopTestServer();
  process.exit(0);
});

// Run tests
runTestsWithServer().then((code) => {
  process.exit(code);
}).catch((error) => {
  log(`❌ Test runner failed: ${error.message}`, 'red');
  process.exit(1);
});