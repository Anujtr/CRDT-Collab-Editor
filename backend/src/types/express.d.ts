import { UserRole } from '../../../shared/src/types/auth';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        userId: string;
        username: string;
        roles: UserRole[];
        permissions: string[];
      };
    }
  }
}