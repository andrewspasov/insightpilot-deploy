const DEFAULT_API_BASE_URL = "http://localhost:8000/api";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export const API_BASE_URL = trimTrailingSlashes(
  import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL,
);

export const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export function withApiPath(path: string): string {
  return `${API_BASE_URL}${normalizePath(path)}`;
}

export function withBackendPath(path: string): string {
  return `${BACKEND_BASE_URL}${normalizePath(path)}`;
}

export const BLOG_URL =
  import.meta.env.VITE_BLOG_URL || withBackendPath("/blog/");
