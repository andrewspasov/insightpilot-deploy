// fetch() that keeps the login alive.
//
// The server gives two tokens at login: a short access token (12 hours) sent
// with every request, and a long refresh token (7 days) whose only job is to
// get a new access token. When a request comes back 401 because the access
// token expired, this asks the server for a new one with the refresh token and
// repeats the request once. If the refresh token is no longer accepted either,
// the session is over: onSessionEnded runs (log out, go to the login page).
//
// This file has no app imports so it can be tested on its own.

type AuthFetchOptions = {
  refreshUrl: string;
  onSessionEnded: () => void;
  fetchImpl?: typeof fetch;
  storage?: Storage;
};

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export function createAuthFetch(options: AuthFetchOptions) {
  const doFetch = (...args: Parameters<typeof fetch>) =>
    (options.fetchImpl ?? globalThis.fetch)(...args);
  const storage = () => options.storage ?? globalThis.localStorage;

  // One renewal at a time: pages fire several requests at once, and they
  // should all wait for the same new token.
  let pendingRefresh: Promise<"renewed" | "ended" | "failed"> | null = null;

  async function renew(): Promise<"renewed" | "ended" | "failed"> {
    const refresh = storage().getItem(REFRESH_KEY);
    if (!refresh) return "ended";
    try {
      const res = await doFetch(options.refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (res.status === 400 || res.status === 401) return "ended";
      if (!res.ok) return "failed";
      const data = (await res.json()) as { access?: string; refresh?: string };
      if (!data.access) return "failed";
      storage().setItem(ACCESS_KEY, data.access);
      if (data.refresh) storage().setItem(REFRESH_KEY, data.refresh);
      return "renewed";
    } catch {
      // Network trouble: keep the tokens and let the caller see the 401.
      return "failed";
    }
  }

  function withToken(init: RequestInit, token: string | null): RequestInit {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    return { ...init, headers };
  }

  return async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const sentToken = storage().getItem(ACCESS_KEY);
    const res = await doFetch(url, withToken(init, sentToken));
    if (res.status !== 401 || !sentToken) return res;

    // Another tab or request may already have renewed the token.
    if (storage().getItem(ACCESS_KEY) === sentToken) {
      pendingRefresh ??= renew().finally(() => {
        pendingRefresh = null;
      });
      const outcome = await pendingRefresh;
      if (outcome === "ended") {
        options.onSessionEnded();
        return res;
      }
      if (outcome === "failed") return res;
    }

    return doFetch(url, withToken(init, storage().getItem(ACCESS_KEY)));
  };
}
