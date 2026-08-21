export type ErrorCode =
  | 'setup_required'
  | 'validation_error'
  | 'not_found'
  | 'unauthenticated'
  | 'forbidden'
  | 'conflict'
  | 'rate_limited'
  | 'unknown_error';

export interface ApiErrorPayload {
  code: ErrorCode;
  message: string;
  setupState?: 'missing';
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly setupState?: 'missing';

  constructor(status: number, code: ErrorCode, message: string, setupState?: 'missing') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.setupState = setupState;
  }

  toPayload(): ApiErrorPayload {
    return { code: this.code, message: this.message, setupState: this.setupState };
  }

  static setupRequired(what: string): ApiError {
    return new ApiError(
      503,
      'setup_required',
      `${what} is not configured in this environment.`,
      'missing',
    );
  }

  static unauthenticated(message = 'Sign-in is required.'): ApiError {
    return new ApiError(401, 'unauthenticated', message);
  }

  static forbidden(message = 'You do not have access to this resource.'): ApiError {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Resource not found.'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'conflict', message);
  }

  static rateLimited(message: string): ApiError {
    return new ApiError(429, 'rate_limited', message);
  }

  static validation(message: string): ApiError {
    return new ApiError(422, 'validation_error', message);
  }
}
