# Backend Testing Guide

This guide will help you test the CRDT Collaborative Editor backend thoroughly.

## Prerequisites

1. **Node.js** (v16 or higher)
2. **npm** (for package management)
3. **curl** (for manual HTTP testing)

## Quick Start

1. **Navigate to the backend directory:**
   ```bash
   cd /Users/anujtr/Desktop/Projects/CRDT-Collab-Editor/backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # For production/development
   cp ../.env.example .env
   
   # Test environment is pre-configured
   # (uses .env.test with testing-friendly rate limits)
   ```
   
   Edit the `.env` file and ensure you have a secure JWT secret (minimum 32 characters):
   ```
   JWT_SECRET=your-super-secret-jwt-key-here-minimum-32-characters-long
   ```

4. **Start the server:**
   
   **For Testing:**
   ```bash
   node tests/runners/start-test-server.js
   ```
   
   **For Development:**
   ```bash
   npm run dev
   ```

## Testing Options

### Option 1: Run All Tests (Recommended)

**Easy Mode - Handles server automatically:**
```bash
node tests/runners/test-with-server.js
```

**Manual Mode - Start server separately:**
```bash
# Terminal 1: Start test server
node tests/runners/start-test-server.js

# Terminal 2: Run tests
node tests/runners/run-all-tests.js
```

**Features:**
- ✅ Automatic test environment setup (NODE_ENV=test)
- ✅ Testing-friendly rate limits (100 requests/minute vs 3-5/hour in production)
- ✅ Intelligent retry logic for rate-limited requests
- ✅ Environment validation before running tests
- ✅ Comprehensive error handling and reporting

### Option 2: Individual Test Suites

Run specific test suites individually:

#### Quick API Testing
```bash
node tests/integration/test-api.js
```
Tests: Health check, user registration/login, protected routes, error handling, input validation, rate limiting

#### Comprehensive Backend Testing

Run the full test suite covering all features:

```bash
node tests/integration/test-comprehensive.js
```

This will test:
- ✅ JWT token management & expiration
- ✅ Rate limiting behavior
- ✅ WebSocket connection handling
- ✅ Error handling & validation
- ✅ Redis failover behavior
- ✅ Security features (XSS, injection protection)
- ✅ Performance metrics

### Option 3: Role System Testing

Test the complete role-based access control system:

```bash
node tests/integration/test-roles.js
```

This will test:
- ✅ Role hierarchy (admin > editor > viewer > user)
- ✅ Permission-based document access
- ✅ API role permissions
- ✅ WebSocket role authentication
- ✅ Document read/write permissions
- ✅ Permission edge cases

### Option 4: Redis & Multi-User Testing

Test Redis integration and multi-user collaboration:

```bash
node tests/integration/test-redis.js
```

This will test:
- ✅ Redis pub/sub integration
- ✅ Multi-user real-time collaboration
- ✅ Role-based document permissions
- ✅ Redis failover behavior
- ✅ Advanced JWT scenarios
- ✅ Cross-user update broadcasting

### Option 5: Manual HTTP Testing

**Health Check:**
```bash
curl http://localhost:8080/api/health
```

**User Registration:**
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123@",
    "email": "test@example.com",
    "role": "editor"
  }'
```

**User Login:**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPass123@"
  }'
```

**Protected Route (replace YOUR_TOKEN):**
```bash
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Option 6: WebSocket Testing

1. **Run the API test first** to get a valid JWT token
2. **Copy the JWT token** from the API test output
3. **Edit `tests/integration/test-websocket.js`** and replace `YOUR_JWT_TOKEN_HERE` with your actual token
4. **Run the WebSocket test:**
   ```bash
   node tests/integration/test-websocket.js
   ```

This will test:
- ✅ WebSocket connection
- ✅ JWT authentication over WebSocket
- ✅ Document room management
- ✅ Real-time document updates
- ✅ Cursor synchronization
- ✅ User presence (join/leave events)

## Available API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - Logout user (protected)

### System
- `GET /api/health` - Health check
- `GET /` - Root endpoint

### WebSocket Events
- `authenticate` - Authenticate with JWT token
- `join-document` - Join a document room
- `leave-document` - Leave a document room
- `document-update` - Send document updates
- `cursor-update` - Send cursor position updates

## User Roles & Permissions

The system supports 4 roles with different permissions:

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all documents |
| **Editor** | Can read and write documents |
| **Viewer** | Can only read documents |
| **User** | No default permissions |

## Error Scenarios to Test

1. **Invalid JWT tokens**
2. **Missing required fields**
3. **Invalid email formats**
4. **Weak passwords** (must contain uppercase, lowercase, number, special character)
5. **Rate limiting** (try rapid requests)
6. **Unauthorized access** to protected routes
7. **Invalid document IDs** in WebSocket events

## Advanced Testing

### Testing with Multiple Clients

1. **Start the server** (`npm run dev`)
2. **Register multiple users** with different roles
3. **Open multiple terminals** and run `tests/integration/test-websocket.js` with different tokens
4. **Observe real-time updates** between clients

### Testing Redis Integration (Optional)

If you have Redis installed:

```bash
# Install Redis (macOS)
brew install redis

# Start Redis server
redis-server

# The backend will automatically connect to Redis when available
```

### Testing Rate Limiting

Make rapid requests to trigger rate limiting:

```bash
# This will trigger rate limiting after a few requests
for i in {1..10}; do
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"wrong","password":"wrong"}'
  sleep 0.1
done
```

## Expected Responses

### Successful Registration
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid-here",
      "username": "testuser",
      "email": "test@example.com",
      "role": "editor",
      "permissions": ["document:read", "document:write"]
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "password",
        "message": "Password must contain at least one uppercase letter..."
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

1. **Port 8080 already in use:**
   ```bash
   lsof -ti:8080 | xargs kill -9
   ```

2. **JWT_SECRET too short:**
   - Ensure your JWT_SECRET is at least 32 characters long

3. **Cannot connect to server:**
   - Make sure the server is running (`npm run dev`)
   - Check the logs for any startup errors

4. **WebSocket connection fails:**
   - Verify the JWT token is valid and not expired
   - Check that the server is running on port 8080

### Server Logs

Monitor server logs for debugging:
```bash
tail -f logs/combined.log
```

## Next Steps

After testing the backend:

1. **All tests pass** ✅ → Ready for frontend integration
2. **Some tests fail** ❌ → Check the logs and fix issues
3. **WebSocket tests work** ✅ → Ready for real-time collaborative features

## Performance Testing

For load testing (requires additional tools):

```bash
# Install artillery (optional)
npm install -g artillery

# Create a load test config and run
artillery quick --count 10 --num 5 http://localhost:8080/api/health
```

---

📝 **Note**: This backend is designed to work with or without Redis. If Redis is not available, it will run in standalone mode with degraded real-time synchronization but full functionality otherwise.