import type { ApiFailure, ApiSuccess, Pagination } from "./types.js";

export function ok<T>(data: T, pagination?: Pagination): ApiSuccess<T> {
  return pagination ? { success: true, data, pagination } : { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiFailure {
  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}
