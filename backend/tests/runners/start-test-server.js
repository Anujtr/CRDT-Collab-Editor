#!/usr/bin/env node

// Set test environment before importing anything
process.env.NODE_ENV = 'test';

const dotenv = require('dotenv');
const { spawn } = require('child_process');

// Load test environment configuration
dotenv.config({ path: '.env.test' });

console.log('🧪 Starting backend server in test mode...');
console.log(`📝 Environment: ${process.env.NODE_ENV}`);
console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? '✅ Set' : '❌ Missing'}`);

// Start the server with test environment
const server = spawn('npx', ['ts-node', 'src/server.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test'
  }
});

server.on('close', (code) => {
  console.log(`\n🛑 Test server exited with code ${code}`);
  process.exit(code);
});

server.on('error', (error) => {
  console.error(`❌ Failed to start test server: ${error.message}`);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down test server...');
  server.kill('SIGTERM');
});