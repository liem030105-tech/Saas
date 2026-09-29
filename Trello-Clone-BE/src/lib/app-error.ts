// Error codes and the detail shape are the API contract, shared with the FE.
import type { ErrorCode, ErrorDetail } from '@trello-clone/shared';

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', 404, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new AppError('FORBIDDEN', 403, message);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError('UNAUTHORIZED', 401, message);
  }
}
