import { databaseService } from '../config/database-service';
import { Permission } from '../../../shared/src/types/auth';
import { Permission as PrismaPermission, $Enums } from '../generated/prisma';
import logger from '../utils/logger';

export interface DocumentMetadata {
  id: string;
  title: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  version: number;
}

export interface DocumentCollaborator {
  userId: string;
  permission: Permission;
  joinedAt: Date;
}

export interface DocumentWithCollaborators extends DocumentMetadata {
  collaborators: DocumentCollaborator[];
}

export class DocumentDatabaseModel {
  private static mapToPrismaPermission(permission: Permission): PrismaPermission {
    // Map from shared Permission to Prisma Permission enum values
    const permissionMap: Record<Permission, PrismaPermission> = {
      [Permission.DOCUMENT_READ]: $Enums.Permission.DOCUMENT_READ,
      [Permission.DOCUMENT_WRITE]: $Enums.Permission.DOCUMENT_WRITE,
      [Permission.DOCUMENT_DELETE]: $Enums.Permission.DOCUMENT_DELETE,
      [Permission.USER_MANAGE]: $Enums.Permission.USER_MANAGE,
      [Permission.ADMIN_ACCESS]: $Enums.Permission.ADMIN_ACCESS,
      [Permission.SNAPSHOT_CREATE]: $Enums.Permission.SNAPSHOT_CREATE,
      [Permission.SNAPSHOT_RESTORE]: $Enums.Permission.SNAPSHOT_RESTORE
    };
    return permissionMap[permission];
  }

  private static mapFromPrismaPermission(permission: string): Permission {
    // Map from Prisma Permission to shared Permission enum values
    const permissionMap: Record<string, Permission> = {
      'DOCUMENT_READ': Permission.DOCUMENT_READ,
      'DOCUMENT_WRITE': Permission.DOCUMENT_WRITE,
      'DOCUMENT_DELETE': Permission.DOCUMENT_DELETE,
      'USER_MANAGE': Permission.USER_MANAGE,
      'ADMIN_ACCESS': Permission.ADMIN_ACCESS,
      'SNAPSHOT_CREATE': Permission.SNAPSHOT_CREATE,
      'SNAPSHOT_RESTORE': Permission.SNAPSHOT_RESTORE
    };
    return permissionMap[permission] || Permission.DOCUMENT_READ;
  }

  static async create(documentData: {
    id: string;
    title: string;
    ownerId: string;
    isPublic?: boolean;
  }): Promise<DocumentMetadata> {
    logger.info('Creating document in database', { 
      id: documentData.id, 
      title: documentData.title, 
      ownerId: documentData.ownerId 
    });
    
    const prisma = databaseService.getClient();

    try {
      const dbDocument = await prisma.document.create({
        data: {
          id: documentData.id,
          title: documentData.title,
          ownerId: documentData.ownerId,
          isPublic: documentData.isPublic || false,
          version: 0
        }
      });

      logger.info(`Document created in database: ${dbDocument.id}`, { 
        title: documentData.title 
      });
      
      return {
        id: dbDocument.id,
        title: dbDocument.title,
        ownerId: dbDocument.ownerId,
        isPublic: dbDocument.isPublic,
        createdAt: dbDocument.createdAt,
        updatedAt: dbDocument.updatedAt,
        lastActivity: dbDocument.lastActivity,
        version: dbDocument.version
      };
    } catch (error: any) {
      logger.error('Failed to create document in database', { 
        error: error.message, 
        documentId: documentData.id 
      });
      
      // Handle unique constraint violations
      if (error.code === 'P2002') {
        throw new Error('Document with this ID already exists');
      }
      
      throw new Error(`Failed to create document: ${error.message}`);
    }
  }

  static async findById(documentId: string): Promise<DocumentWithCollaborators | null> {
    try {
      const prisma = databaseService.getClient();
      
      const dbDocument = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          collaborators: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!dbDocument) {
        return null;
      }

      const collaborators: DocumentCollaborator[] = dbDocument.collaborators.map(collab => ({
        userId: collab.userId,
        permission: this.mapFromPrismaPermission(collab.permission),
        joinedAt: collab.joinedAt
      }));

      return {
        id: dbDocument.id,
        title: dbDocument.title,
        ownerId: dbDocument.ownerId,
        isPublic: dbDocument.isPublic,
        createdAt: dbDocument.createdAt,
        updatedAt: dbDocument.updatedAt,
        lastActivity: dbDocument.lastActivity,
        version: dbDocument.version,
        collaborators
      };
    } catch (error: any) {
      logger.error('Failed to find document by ID', { 
        error: error.message, 
        documentId 
      });
      return null;
    }
  }

  static async updateById(documentId: string, updates: Partial<DocumentMetadata>): Promise<DocumentMetadata | null> {
    try {
      const prisma = databaseService.getClient();
      
      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;
      if (updates.version !== undefined) updateData.version = updates.version;
      if (updates.lastActivity !== undefined) updateData.lastActivity = updates.lastActivity;

      const dbDocument = await prisma.document.update({
        where: { id: documentId },
        data: updateData
      });

      return {
        id: dbDocument.id,
        title: dbDocument.title,
        ownerId: dbDocument.ownerId,
        isPublic: dbDocument.isPublic,
        createdAt: dbDocument.createdAt,
        updatedAt: dbDocument.updatedAt,
        lastActivity: dbDocument.lastActivity,
        version: dbDocument.version
      };
    } catch (error: any) {
      logger.error('Failed to update document', { 
        error: error.message, 
        documentId 
      });
      return null;
    }
  }

  static async deleteById(documentId: string): Promise<boolean> {
    try {
      const prisma = databaseService.getClient();
      
      await prisma.document.delete({
        where: { id: documentId }
      });

      logger.info(`Document deleted from database: ${documentId}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to delete document', { 
        error: error.message, 
        documentId 
      });
      return false;
    }
  }

  static async listForUser(userId: string, options: {
    page?: number;
    limit?: number;
    includePublic?: boolean;
  } = {}): Promise<{
    documents: DocumentWithCollaborators[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, includePublic = true } = options;
    const offset = (page - 1) * limit;

    try {
      const prisma = databaseService.getClient();
      
      // Build where clause for documents user has access to
      const whereClause = {
        OR: [
          // Documents owned by user
          { ownerId: userId },
          // Documents where user is a collaborator
          {
            collaborators: {
              some: {
                userId: userId
              }
            }
          }
        ] as any[]
      };

      // Add public documents if requested
      if (includePublic) {
        whereClause.OR.push({ isPublic: true });
      }

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where: whereClause,
          include: {
            collaborators: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true
                  }
                }
              }
            }
          },
          orderBy: {
            lastActivity: 'desc'
          },
          skip: offset,
          take: limit
        }),
        prisma.document.count({
          where: whereClause
        })
      ]);

      const documentsWithCollaborators: DocumentWithCollaborators[] = documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        ownerId: doc.ownerId,
        isPublic: doc.isPublic,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        lastActivity: doc.lastActivity,
        version: doc.version,
        collaborators: doc.collaborators.map(collab => ({
          userId: collab.userId,
          permission: this.mapFromPrismaPermission(collab.permission),
          joinedAt: collab.joinedAt
        }))
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        documents: documentsWithCollaborators,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      logger.error('Failed to list documents for user', { 
        error: error.message, 
        userId 
      });
      return {
        documents: [],
        total: 0,
        page,
        totalPages: 0
      };
    }
  }

  static async addCollaborator(documentId: string, userId: string, permission: Permission = Permission.DOCUMENT_WRITE): Promise<boolean> {
    try {
      const prisma = databaseService.getClient();
      
      // Use upsert to handle case where collaborator already exists
      await prisma.documentCollaborator.upsert({
        where: {
          documentId_userId: {
            documentId,
            userId
          }
        },
        create: {
          documentId,
          userId,
          permission: this.mapToPrismaPermission(permission)
        },
        update: {
          permission: this.mapToPrismaPermission(permission)
        }
      });

      // Update document lastActivity
      await prisma.document.update({
        where: { id: documentId },
        data: { lastActivity: new Date() }
      });

      logger.info(`Collaborator added to document: ${userId} -> ${documentId} with ${permission}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to add collaborator', { 
        error: error.message, 
        documentId, 
        userId 
      });
      return false;
    }
  }

  static async removeCollaborator(documentId: string, userId: string): Promise<boolean> {
    try {
      const prisma = databaseService.getClient();
      
      await prisma.documentCollaborator.delete({
        where: {
          documentId_userId: {
            documentId,
            userId
          }
        }
      });

      // Update document lastActivity
      await prisma.document.update({
        where: { id: documentId },
        data: { lastActivity: new Date() }
      });

      logger.info(`Collaborator removed from document: ${userId} -> ${documentId}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to remove collaborator', { 
        error: error.message, 
        documentId, 
        userId 
      });
      return false;
    }
  }

  static async hasAccess(documentId: string, userId: string, requiredPermission: Permission = Permission.DOCUMENT_READ): Promise<boolean> {
    try {
      const document = await this.findById(documentId);
      if (!document) {
        return false;
      }

      // Owner always has access
      if (document.ownerId === userId) {
        return true;
      }

      // Public documents allow read access
      if (document.isPublic && requiredPermission === Permission.DOCUMENT_READ) {
        return true;
      }

      // Check collaborator permissions
      const collaborator = document.collaborators.find(c => c.userId === userId);
      if (!collaborator) {
        return false;
      }

      // For now, we'll use a simple permission hierarchy
      // DOCUMENT_WRITE includes DOCUMENT_READ
      // DOCUMENT_DELETE includes both DOCUMENT_WRITE and DOCUMENT_READ
      const permissionHierarchy: Record<Permission, Permission[]> = {
        [Permission.DOCUMENT_READ]: [Permission.DOCUMENT_READ],
        [Permission.DOCUMENT_WRITE]: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE],
        [Permission.DOCUMENT_DELETE]: [Permission.DOCUMENT_READ, Permission.DOCUMENT_WRITE, Permission.DOCUMENT_DELETE],
        [Permission.USER_MANAGE]: [Permission.USER_MANAGE],
        [Permission.ADMIN_ACCESS]: [Permission.ADMIN_ACCESS],
        [Permission.SNAPSHOT_CREATE]: [Permission.SNAPSHOT_CREATE],
        [Permission.SNAPSHOT_RESTORE]: [Permission.SNAPSHOT_RESTORE]
      };

      const userPermissions = permissionHierarchy[collaborator.permission] || [];
      return userPermissions.includes(requiredPermission);
    } catch (error: any) {
      logger.error('Failed to check document access', { 
        error: error.message, 
        documentId, 
        userId 
      });
      return false;
    }
  }

  static async updateActivity(documentId: string): Promise<void> {
    try {
      const prisma = databaseService.getClient();
      
      await prisma.document.update({
        where: { id: documentId },
        data: { 
          lastActivity: new Date(),
          version: {
            increment: 1
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to update document activity', { 
        error: error.message, 
        documentId 
      });
    }
  }

  static async getStats(): Promise<{
    totalDocuments: number;
    publicDocuments: number;
    totalCollaborators: number;
  }> {
    try {
      const prisma = databaseService.getClient();
      
      const [totalDocuments, publicDocuments, totalCollaborators] = await Promise.all([
        prisma.document.count(),
        prisma.document.count({ where: { isPublic: true } }),
        prisma.documentCollaborator.count()
      ]);

      return {
        totalDocuments,
        publicDocuments,
        totalCollaborators
      };
    } catch (error: any) {
      logger.error('Failed to get document stats', { error: error.message });
      return {
        totalDocuments: 0,
        publicDocuments: 0,
        totalCollaborators: 0
      };
    }
  }
}