// Request fields added by our middlewares (security.md → Authentication vs. authorization).
declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate` once the access token is verified; read it with `currentUserId(req)`. */
      userId?: string;
    }
  }
}

export {};
