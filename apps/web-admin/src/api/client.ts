import { mockApiRequest } from "./mockApi";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

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

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (USE_MOCK_API) {
    return mockApiRequest<T>(path, init);
  }

  const headers = init.body instanceof FormData
    ? init.headers
    : {
        "Content-Type": "application/json",
        ...init.headers
      };

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers
  });
  const payload = (await response.json()) as ApiResult<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "Yêu cầu thất bại");
  }
  return payload.data as T;
}
