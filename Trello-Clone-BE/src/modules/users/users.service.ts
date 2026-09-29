// The users module's public API for other modules (backend.md → cross-module communication).
// Profile endpoints (GET /auth/me, PATCH /users/me) join this service in AUTH-005.
export { toUserDto } from './users.mapper';
