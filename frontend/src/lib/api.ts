import { getAccessToken } from "./auth";
import { withApiPath } from "./env";

/**
 * Small helper for GET requests to your backend.
 * - It reads the JWT access token from localStorage
 * - It sends it in the Authorization header
 * - It throws an error if the response is not ok (status 200–299)
 *
 * <T> is a generic type parameter:
 *   it means you can tell TypeScript "I expect this function to return T".
 *   For example apiGet<Track[]>("/ntr/tracks/") means "I expect an array of Track".
 */
export async function apiGet<T>(path: string): Promise<T> {
  // Read the JWT token stored after login
  const accessToken = localStorage.getItem("access_token");

  // Do the HTTP GET request
  const res = await fetch(withApiPath(path), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // Only add the Authorization header if we have a token
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  // If the response is not in the "ok" range (200–299),
  // we throw an error so we can catch it in our pages.
  if (!res.ok) {
    // You can make this smarter later (check 401, 403, etc)
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
  // Get the access token from localStorage (we stored this on login)
  const token = localStorage.getItem("access_token");

  const res = await fetch(withApiPath(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const token = localStorage.getItem("access_token");

  const res = await fetch(withApiPath(path), {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  // Read JWT token from the browser (we saved it on login)
  const token = getAccessToken();

  const res = await fetch(withApiPath(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      // If we have a token, send it as Authorization header
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const token = getAccessToken();

  const res = await fetch(withApiPath(path), {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`DELETE ${path} failed with status ${res.status}`);
  }
}
  
