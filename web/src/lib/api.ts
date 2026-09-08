import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }> | unknown;
  status: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread?: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: PageMeta;
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
});

/** Último usuario devuelto por /auth/refresh (evita una segunda petición). */
let lastRefreshUser: unknown = null;

export function consumeRefreshedUser<T>(): T | null {
  const value = lastRefreshUser as T | null;
  lastRefreshUser = null;
  return value;
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

/** Renueva el token una sola vez aunque varias peticiones fallen a la vez. */
export async function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= axios
    .post<{ data: { accessToken: string; user?: unknown } }>(`${BASE_URL}/auth/refresh`, null, {
      withCredentials: true,
    })
    .then((res) => {
      accessToken = res.data.data.accessToken;
      lastRefreshUser = res.data.data.user ?? null;
      return accessToken;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { code: string; message: string; details?: unknown } }>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status ?? 0;

    const isAuthRoute = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      const token = await refreshAccessToken();
      if (token) return http(original);
      onUnauthorized?.();
    }

    const payload = error.response?.data?.error;
    const apiError: ApiError = {
      code: payload?.code ?? (status === 0 ? 'SIN_CONEXION' : 'ERROR'),
      message:
        payload?.message ??
        (status === 0
          ? 'No se pudo conectar con el servidor. Verifique su conexión.'
          : 'Ocurrió un error inesperado.'),
      details: payload?.details,
      status,
    };
    return Promise.reject(apiError);
  },
);

/** Extrae un mensaje legible de cualquier error de la API. */
export function errorMessage(error: unknown): string {
  const apiError = error as ApiError;
  if (apiError?.message) {
    if (Array.isArray(apiError.details) && apiError.details.length > 0) {
      const first = apiError.details[0] as { field?: string; message?: string };
      if (first?.message) return `${apiError.message}: ${first.message}`;
    }
    return apiError.message;
  }
  return 'Ocurrió un error inesperado.';
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await http.get<{ data: T }>(url, { params });
  return res.data.data;
}

export async function apiList<T>(url: string, params?: Record<string, unknown>): Promise<ApiListResponse<T>> {
  const res = await http.get<{ data: T[]; meta: PageMeta }>(url, { params });
  return { data: res.data.data, meta: res.data.meta };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<{ data: T }>(url, body);
  return res.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<{ data: T }>(url, body);
  return res.data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<{ data: T }>(url, body);
  return res.data.data;
}

export async function apiDelete(url: string): Promise<void> {
  await http.delete(url);
}

/** Descarga un archivo generado por la API (Excel, CSV o PDF). */
export async function apiDownload(
  url: string,
  params: Record<string, unknown> | undefined,
  fallbackName: string,
): Promise<{ blob: Blob; fileName: string }> {
  const res = await http.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  return { blob: res.data as Blob, fileName: match?.[1] ?? fallbackName };
}
