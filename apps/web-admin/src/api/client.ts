import { mockApiRequest } from "./mockApi";

const DEFAULT_API_BASE = "/api/v1";
const DEFAULT_API_ASSET_BASE = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:3001/api/v1`
  : DEFAULT_API_BASE;
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/+$/, "");
const API_ASSET_BASE = (
  import.meta.env.VITE_API_ASSET_BASE_URL ??
  (API_BASE.startsWith("http") ? API_BASE : DEFAULT_API_ASSET_BASE)
).replace(/\/+$/, "");
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiAssetUrl(path: string): string {
  return `${API_ASSET_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body, headers: {} });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractApiErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload)) {
    const error = isRecord(payload.error) ? payload.error : null;
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }

  return fallback;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (USE_MOCK_API) {
    return mockApiRequest<T>(path, init);
  }

  const hasBody = init.body !== undefined && init.body !== null;
  const headers = init.body instanceof FormData
    ? init.headers
    : hasBody
      ? {
        "Content-Type": "application/json",
        ...init.headers
      }
      : init.headers;

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers
  });

  const raw = await response.text();
  const fallbackMessage = raw.trim() || response.statusText || "Yêu cầu thất bại";
  let payload: ApiResult<T> | null = null;

  if (raw) {
    try {
      payload = JSON.parse(raw) as ApiResult<T>;
    } catch {
      if (!response.ok) {
        throw new Error(fallbackMessage);
      }
    }
  }

  if (!response.ok || !payload?.success) {
    throw new Error(extractApiErrorMessage(payload, fallbackMessage));
  }

  return payload.data as T;
}
