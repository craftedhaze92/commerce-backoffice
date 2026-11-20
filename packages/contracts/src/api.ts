export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_REUSED'
  | 'FORBIDDEN'
  | 'CSRF_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface PageMeta {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
