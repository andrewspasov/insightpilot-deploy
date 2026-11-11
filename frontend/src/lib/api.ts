// frontend/src/lib/api.ts

import { logout } from "./auth";
import { createAuthFetch } from "./auth-fetch";

// Base URL of your Django API, e.g. https://api.example.com/api in production.
// Set VITE_API_URL at build time; local development falls back to localhost.
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

// The backend's origin without /api, for non-API routes (accounts, OAuth, blog).
export const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

let sessionEnded = false;

/**
 * fetch() for logged-in requests: adds the access token, renews it with the
 * refresh token when it has expired, and sends the user to the login page
 * when the session is over (refresh token expired too).
 */
export const authFetch = createAuthFetch({
  refreshUrl: `${API_BASE_URL}/refresh/`,
  onSessionEnded: () => {
    if (sessionEnded) return;
    sessionEnded = true;
    logout();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
  },
});

/**
 * Small helper for GET requests to your backend.
 * - It sends the login token (see authFetch above)
 * - It throws an error if the response is not ok (status 200–299)
 *
 * <T> is a generic type parameter:
 *   it means you can tell TypeScript "I expect this function to return T".
 *   For example apiGet<Track[]>("/ntr/tracks/") means "I expect an array of Track".
 */
export async function apiGet<T>(path: string): Promise<T> {
  // Do the HTTP GET request
  const res = await authFetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  // If the response is not in the "ok" range (200–299),
  // we throw an error so we can catch it in our pages.
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  // Parse the JSON body and return it as type T
  return res.json();
}




// Send a POST request with a JSON body.
// TBody = shape of the request body we send
// TResponse = shape of the JSON we expect back
export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const baseUrl = API_BASE_URL;

  const res = await authFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // If backend sends JSON with error, try to show that
    let message = `API POST ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      // DRF validation errors often come back as {field: ["msg"]}
      if (typeof data === "object" && data !== null) {
        if (data.detail || data.error) {
          message = data.detail || data.error;
        } else {
          const firstKey = Object.keys(data)[0];
          const firstVal = Array.isArray(data[firstKey])
            ? data[firstKey].join(", ")
            : String(data[firstKey]);
          message = `${firstKey}: ${firstVal}`;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
    console.error("API POST error", { path, status: res.status, message });
    throw new Error(message);
  }

  // Parse and return JSON
  return res.json() as Promise<TResponse>;
}

export async function apiPostForm<TResponse>(
  path: string,
  body: FormData,
): Promise<TResponse> {
  const baseUrl = API_BASE_URL;
  const res = await authFetch(`${baseUrl}${path}`, {
    method: "POST",
    body,
  });

  if (!res.ok) {
    let message = `API POST ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data === "object" && data !== null) {
        const errorData = data as Record<string, unknown>;
        if (typeof errorData.detail === "string") {
          message = errorData.detail;
        } else if (typeof errorData.error === "string") {
          message = errorData.error;
        } else {
          const firstKey = Object.keys(errorData)[0];
          const firstVal = errorData[firstKey];
          message = Array.isArray(firstVal) ? firstVal.join(", ") : String(firstVal);
        }
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return res.json() as Promise<TResponse>;
}



// PATCH helper: used when we want to *update* part of a resource
export async function apiPatch<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  // Build the full URL, e.g. "/ntr/tracks/1/" -> "http://localhost:8000/api/ntr/tracks/1/"
  const url = `${API_BASE_URL}${path}`;

  const res = await authFetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `PATCH ${path} failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data === "object" && data !== null) {
        if ((data as any).detail || (data as any).error) {
          message = (data as any).detail || (data as any).error;
        } else {
          const firstKey = Object.keys(data)[0];
          const firstVal = Array.isArray((data as any)[firstKey])
            ? (data as any)[firstKey].join(", ")
            : String((data as any)[firstKey]);
          message = `${firstKey}: ${firstVal}`;
        }
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  // Parse the JSON response as TResponse type
  return res.json();
}

// DELETE helper: used when we want to remove a resource completely
export async function apiDelete(path: string): Promise<void> {
  const url = `${API_BASE_URL}${path}`;
  const res = await authFetch(url, {
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(`DELETE ${path} failed with status ${res.status}`);
  }
}
  
