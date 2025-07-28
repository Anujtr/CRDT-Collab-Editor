const { PrismaClient } = require('../generated/prisma');

describe('Database Connection Test', () => {
  let prisma;

  beforeAll(async () => {
    // Set up database URL
    process.env.DATABASE_URL = 'postgresql://crdt_user:crdt_password_change_in_production@localhost:5432/crdt_collab_editor?schema=public';
    
    // Initialize Prisma client
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  test('should connect to PostgreSQL database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    expect(result).toEqual([{ connected: 1 }]);
  });

  test('should have all required tables', async () => {
    const result = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const tableNames = result.map(row => row.table_name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('documents');
    expect(tableNames).toContain('document_collaborators');
    expect(tableNames).toContain('document_snapshots');
    expect(tableNames).toContain('user_sessions');
  });

  test('should support basic CRUD operations', async () => {
    // Test creating a user
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_password_123',
        role: 'USER'
      }
    });

    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');

    // Test reading the user
    const foundUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    expect(foundUser).toBeTruthy();
    expect(foundUser.username).toBe('testuser');

    // Clean up
    await prisma.user.delete({
      where: { id: user.id }
    });
  });
});