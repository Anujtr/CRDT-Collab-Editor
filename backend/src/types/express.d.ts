import { AuthTokenPayload } from '../../../shared/src/types/auth';

declare global {
  namespace Express {
    export interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};