// Request fields added by our middlewares (security.md → Authentication vs. authorization).
declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate` (AUTH-005) once the access token is verified. */
      userId?: string;
    }
  }
}

export {};
