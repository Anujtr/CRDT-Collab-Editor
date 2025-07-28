import { PrismaClient } from '../../generated/prisma';
import { databaseService } from '../../config/database-service';

describe('Database Connection Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Set up environment for testing
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://crdt_user:crdt_password_change_in_production@localhost:5432/crdt_collab_editor?schema=public';
    }

    // Connect to database service
    await databaseService.connect();
    prisma = databaseService.getClient();
  });

  afterAll(async () => {
    await databaseService.disconnect();
  });

  describe('PostgreSQL Connection', () => {
    it('should connect to PostgreSQL database successfully', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as connected`;
      expect(result).toEqual([{ connected: 1 }]);
    });

    it('should have required extensions enabled', async () => {
      const result = await prisma.$queryRaw`
        SELECT extname 
        FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pg_trgm')
        ORDER BY extname
      `;
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should support UUID generation', async () => {
      const result = await prisma.$queryRaw`SELECT uuid_generate_v4() as uuid`;
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('uuid');
      expect(typeof (result[0] as any).uuid).toBe('string');
    });
  });

  describe('Database Service', () => {
    it('should report connection as healthy', async () => {
      const isHealthy = await databaseService.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should report correct connection status', () => {
      const isConnected = databaseService.isClientConnected();
      expect(isConnected).toBe(true);
    });

    it('should handle transactions', async () => {
      const result = await databaseService.executeInTransaction(async (tx) => {
        return await tx.$queryRaw`SELECT 'transaction_test' as test`;
      });
      expect(result).toEqual([{ test: 'transaction_test' }]);
    });
  });

  describe('Database Schema', () => {
    it('should have all required tables created', async () => {
      const result = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      
      expect(Array.isArray(result)).toBe(true);
      
      const tableNames = (result as any[]).map(row => row.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('documents');
      expect(tableNames).toContain('document_collaborators');
      expect(tableNames).toContain('document_snapshots');
      expect(tableNames).toContain('user_sessions');
    });

    it('should have correct enum types created', async () => {
      const result = await prisma.$queryRaw`
        SELECT typname 
        FROM pg_type 
        WHERE typtype = 'e'
        ORDER BY typname
      `;
      
      expect(Array.isArray(result)).toBe(true);
      const enumNames = (result as any[]).map(row => row.typname);
      expect(enumNames).toContain('permission');
      expect(enumNames).toContain('user_role');
    });
  });
});