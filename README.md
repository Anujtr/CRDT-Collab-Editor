# CRDT Collaborative Editor

A real-time collaborative text editor built with CRDTs, WebSockets, PostgreSQL, Redis Pub/Sub, role-based access control, and comprehensive offline support.

<img width="1680" height="1010" alt="Screenshot 2025-07-27 at 3 30 56 PM" src="https://github.com/user-attachments/assets/d3d3724b-64c7-418e-8f5a-9fa34efdf045" />

## 🌟 Features

### ✅ **Real-time Collaboration**
- **Conflict-free editing** with Yjs CRDTs
- **Sub-100ms sync latency** via WebSocket + Redis Pub/Sub
- **Multi-user presence** with user awareness
- **Rich text editing** with Slate.js editor

### ✅ **Offline-First Architecture**
- **IndexedDB storage** for offline edits
- **Service Workers** for PWA functionality
- **Background sync** when connection restored
- **Automatic conflict resolution** on reconnect

### ✅ **Production Security**
- **JWT authentication** with role-based access control
- **Permission-based document access** (read/write/admin)
- **Secure WebSocket connections** with token validation
- **Role hierarchy**: Admin → Editor → Viewer → User

### ✅ **Enterprise Features**
- **S3 snapshot storage** with automated backups
- **Horizontal scaling** with stateless backend
- **Comprehensive monitoring** (Prometheus + Grafana)
- **Chaos testing** for network resilience

### ✅ **Developer Experience**
- **Comprehensive testing** (Unit + Integration + Chaos)
- **Docker deployment** with multi-service orchestration
- **CI/CD ready** with GitHub Actions support
- **Type-safe** development with extensive error handling

---

<img width="1680" height="1011" alt="Screenshot 2025-07-27 at 3 30 40 PM" src="https://github.com/user-attachments/assets/11e2df79-93f6-43f4-bfad-667ad902658a" />

## 🏗️ Architecture

```
┌─────────────────┐    WebSocket/HTTP    ┌──────────────────┐
│   React Client  │ ◄──────────────────► │   Nginx Proxy    │
│   (Slate.js +   │                      │  (Load Balancer) │
│    Service      │                      └──────────────────┘
│    Workers)     │                               │
└─────────────────┘                               │
        │                                         ▼
        │ IndexedDB                    ┌──────────────────┐
        ▼                              │   Node.js Server │
┌─────────────────┐                    │  (JWT + RBAC +   │
│ Offline Storage │                    │   WebSockets)    │
└─────────────────┘                    └──────────────────┘
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          │                     │                     │
                          ▼                     ▼                     ▼
                 ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
                 │ Redis Pub/Sub   │   │   AWS S3        │   │  Prometheus     │
                 │ (Message Queue) │   │ (Snapshots)     │   │  (Metrics)      │
                 └─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## 📊 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Slate.js | Rich text editor with CRDT integration |
| **CRDT Engine** | Yjs | Conflict-free replicated data types |
| **Real-time** | WebSockets + Redis Pub/Sub | Message broadcasting and synchronization |
| **Backend** | Node.js + Express | REST API + WebSocket server |
| **Authentication** | JWT + RBAC | Security and permissions |
| **Database** | PostgreSQL + Prisma | Primary data persistence |
| **Storage** | Redis + IndexedDB + S3 | Multi-layer persistence strategy |
| **Offline** | Service Workers + PWA | Offline-first experience |
| **Infrastructure** | Docker + Nginx | Deployment and scaling |
| **Monitoring** | Prometheus + Grafana | Observability |
| **Testing** | Jest + WebSocket testing | Quality assurance |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** >= 18
- **PostgreSQL** >= 13
- **Docker** (optional but recommended)

### Option 1: Docker Deployment (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/Anujtr/CRDT-Collab-Editor.git
cd CRDT-Collab-Editor

# 2. Start PostgreSQL database
cd infra
docker-compose up postgres -d

# 3. Setup backend environment and database
cd ../backend
cat > .env << EOF
NODE_ENV=development
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-here
DATABASE_URL=postgresql://crdtuser:crdtpass@localhost:5432/crdt_collab_editor
CLIENT_URL=http://localhost:3000
EOF

# 4. Install dependencies and run migrations
npm install
npx prisma migrate dev

# 5. Start backend (Terminal 1)
npm run dev

# 6. Start frontend (Terminal 2)
cd ../frontend
npm install
npm start

# 7. Access the application
open http://localhost:3000
```

### Option 2: Local Development (PostgreSQL Required)

```bash
# 1. Install PostgreSQL locally
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql postgresql-contrib
# Windows: Download from https://www.postgresql.org/download/

# 2. Create database and user
sudo -u postgres psql
CREATE DATABASE crdt_collab_editor;
CREATE USER crdtuser WITH PASSWORD 'crdtpass';
GRANT ALL PRIVILEGES ON DATABASE crdt_collab_editor TO crdtuser;
\q

# 3. Clone and setup project
git clone https://github.com/Anujtr/CRDT-Collab-Editor.git
cd CRDT-Collab-Editor

# 4. Setup backend
cd backend
npm install

# Create environment file
cat > .env << EOF
NODE_ENV=development
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL=postgresql://crdtuser:crdtpass@localhost:5432/crdt_collab_editor
CLIENT_URL=http://localhost:3000
EOF

# Run database migrations
npx prisma migrate dev

# 5. Setup frontend
cd ../frontend
npm install

# 6. Start both services
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm start

# 7. Open multiple tabs at http://localhost:3000 to test collaboration
```

---

## 🔐 Authentication & Authorization

### User Roles

| Role | Permissions | Description |
|------|-------------|-------------|
| **Admin** | `*` (all permissions) | Full system access, user management |
| **Editor** | `document:read`, `document:write` | Can read and edit documents |
| **Viewer** | `document:read` | Read-only access to documents |
| **User** | Basic access | Limited access, assignable permissions |

<img width="1680" height="1012" alt="Screenshot 2025-07-27 at 3 30 02 PM" src="https://github.com/user-attachments/assets/188bc75e-bc89-4229-808b-de99eec0337d" />

### JWT Claims Structure

```json
{
  "userId": "user-123",
  "roles": ["editor"],
  "permissions": ["document:read", "document:write"],
  "iat": 1640995200,
  "exp": 1641081600
}
```

### API Authentication Examples

```bash
# Register with role
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "editor1",
    "password": "securepass123",
    "email": "editor@example.com",
    "role": "editor"
  }'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "editor1",
    "password": "securepass123"
  }'

# Access protected endpoint
curl -X GET http://localhost:8080/api/documents/doc1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
<img width="1680" height="1011" alt="Screenshot 2025-07-27 at 3 30 14 PM" src="https://github.com/user-attachments/assets/d5cbef6c-7348-4a52-9be0-2e239af34dac" />

---

## 📱 Offline Support

### Service Worker Features
- **Offline page** when network unavailable
- **Background sync** for queued edits
- **Asset caching** for core app functionality
- **Update notifications** for new versions

### IndexedDB Storage
- **Automatic saving** of offline edits
- **Conflict resolution** on reconnect
- **Edit history** and statistics
- **Cross-tab synchronization**

### PWA Installation
The app supports installation as a Progressive Web App:
- Install prompt for mobile/desktop
- Offline-first functionality
- Native app-like experience

---

## 🔄 S3 Snapshot System

### Automated Backups
- **Scheduled snapshots** every 6 hours (configurable)
- **Version history** with configurable retention
- **Incremental backups** to minimize storage costs
- **Cross-region replication** support

### Snapshot Management API

```bash
# Create manual snapshot (Admin only)
curl -X POST http://localhost:8080/api/snapshots/document-1 \
  -H "Authorization: Bearer ADMIN_TOKEN"

# List snapshots
curl -X GET http://localhost:8080/api/snapshots/document-1 \
  -H "Authorization: Bearer TOKEN"

# Restore from snapshot (Admin only)
curl -X POST http://localhost:8080/api/snapshots/document-1/restore \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timestamp": "2024-01-15T10:30:00.000Z"}'

# Get snapshot statistics
curl -X GET http://localhost:8080/api/admin/snapshots/stats \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 📊 Monitoring & Observability

### Prometheus Metrics
- `websocket_connections_total` - Active WebSocket connections
- `http_requests_total` - HTTP request counts
- `documents_total` - Number of active documents
- `collaborators_total` - Active collaborators per room

### Grafana Dashboards
Access Grafana at `http://localhost:3001` (admin/admin):
- **Real-time collaboration metrics**
- **System performance monitoring**
- **User activity analytics**
- **Error tracking and alerting**

### Health Checks
```bash
# Application health
curl http://localhost:8080/health

# Metrics endpoint
curl http://localhost:8080/metrics

# Connection stats (Admin only)
curl -H "Authorization: Bearer ADMIN_TOKEN" \
     http://localhost:8080/api/connections
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `8080` |
| `JWT_SECRET` | JWT signing secret | Required |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 | Required for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Required for S3 |
| `S3_BUCKET_NAME` | S3 bucket for snapshots | `crdt-collab-editor-snapshots` |
| `SNAPSHOT_INTERVAL` | Cron schedule for snapshots | `0 */6 * * *` |

### Frontend Configuration
```javascript
// React environment variables
REACT_APP_WS_URL=ws://localhost:8080/ws
REACT_APP_API_URL=http://localhost:8080/api
```

---

## 🐳 Docker Deployment

### Production Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  frontend:
    build: ./frontend
    environment:
      - REACT_APP_WS_URL=wss://yourdomain.com/ws
      - REACT_APP_API_URL=https://yourdomain.com/api
    
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_HOST=redis
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    
  nginx:
    build: ./nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs
```

### Scaling Horizontally

```bash
# Scale backend instances
docker-compose up --scale backend=3

# Load balancing handled by Nginx
# Redis Pub/Sub ensures message delivery across instances
```

---

## 🚀 Performance

### Benchmarks
- **Sync Latency**: < 100ms (local network)
- **Concurrent Users**: 1000+ per backend instance
- **Message Throughput**: 10,000+ ops/second
- **Offline Storage**: Unlimited (IndexedDB)

### Optimization Features
- **Connection pooling** for Redis
- **Message compression** for large documents  
- **Incremental sync** to minimize bandwidth
- **Lazy loading** for document history

---

## 🔒 Security Best Practices

### Implemented Security Measures
- **JWT token expiration** and refresh
- **Role-based access control** at API and WebSocket level
- **Input validation** and sanitization
- **Rate limiting** on authentication endpoints
- **CORS configuration** for cross-origin requests
- **Helmet.js** for security headers

### WebSocket Security
- **Token validation** on connection
- **Permission checks** for document access
- **Message origin verification**
- **Connection rate limiting**

---

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Run tests**: `npm test`
4. **Commit changes**: `git commit -m 'Add amazing feature'`
5. **Push to branch**: `git push origin feature/amazing-feature`
6. **Open Pull Request**

### Development Guidelines
- Follow ESLint configuration
- Write tests for new features
- Update documentation
- Ensure Docker builds pass

---

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Current user info

### Document Endpoints
- `GET /api/documents/:id` - Get document
- `POST /api/documents/:id/edit` - Edit document
- `DELETE /api/documents/:id` - Delete document (Admin)

### Admin Endpoints
- `GET /api/admin/users` - List users (Admin)
- `POST /api/admin/permissions` - Update permissions (Admin)
- `GET /api/admin/snapshots/stats` - Snapshot statistics (Admin)

### WebSocket Events
- `crdt-update` - Document state changes
- `user-joined` - User presence
- `user-left` - User disconnect
- `error` - Error notifications

---

## ⚠️ Troubleshooting

### Common Issues

**WebSocket Connection Failed**
```bash
# Check backend is running
curl http://localhost:8080/health

# Verify token is valid
# Check browser dev tools for WebSocket errors
```

**Redis Connection Error**
```bash
# Ensure Redis is running
redis-cli ping

# Check Redis configuration in .env
```

**S3 Snapshot Errors**
```bash
# Verify AWS credentials
aws s3 ls

# Check bucket permissions
# Ensure correct region configuration
```

**Offline Sync Issues**
```bash
# Clear IndexedDB in browser dev tools
# Check service worker registration
# Verify background sync permissions
```

---

