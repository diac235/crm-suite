export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleSlug: string;
  roleLevel: number;
  teamId: string | null;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

export {};
