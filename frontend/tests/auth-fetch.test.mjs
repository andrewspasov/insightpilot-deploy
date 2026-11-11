import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadAuthFetch() {
  const exports = {};
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("../src/lib/auth-fetch.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  );
  runInNewContext(outputText, { exports, Headers, JSON, Promise, globalThis: {} });
  return exports.createAuthFetch;
}

function memoryStorage(initial) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status });

// Fake server: accepts only the access token in `valid`, renews with `refreshOk`.
function fakeServer({ valid, refreshStatus = 200, newAccess = "fresh" }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const auth = new Headers(init.headers).get("Authorization");
    calls.push({ url, auth });
    if (url.endsWith("/refresh/")) {
      return refreshStatus === 200 ? json(200, { access: newAccess }) : json(refreshStatus, { detail: "nope" });
    }
    if (auth === `Bearer ${valid}` || auth === `Bearer ${newAccess}`) return json(200, { ok: true });
    return json(401, { code: "token_not_valid" });
  };
  return { calls, fetchImpl };
}

const createAuthFetch = loadAuthFetch();

test("a valid token is sent and nothing is renewed", async () => {
  const storage = memoryStorage({ access_token: "good", refresh_token: "r" });
  const server = fakeServer({ valid: "good" });
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => assert.fail(), fetchImpl: server.fetchImpl, storage });
  const res = await authFetch("/api/billing/passes/");
  assert.equal(res.status, 200);
  assert.deepEqual(server.calls.map((c) => c.auth), ["Bearer good"]);
});

test("an expired token is renewed and the request repeated", async () => {
  const storage = memoryStorage({ access_token: "old", refresh_token: "r" });
  const server = fakeServer({ valid: "none" });
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => assert.fail(), fetchImpl: server.fetchImpl, storage });
  const res = await authFetch("/api/billing/passes/", { headers: { "Content-Type": "application/json" } });
  assert.equal(res.status, 200);
  assert.equal(storage.getItem("access_token"), "fresh");
  assert.deepEqual(server.calls.map((c) => c.url), ["/api/billing/passes/", "/api/refresh/", "/api/billing/passes/"]);
  assert.equal(server.calls[2].auth, "Bearer fresh");
});

test("requests that fail together share one renewal", async () => {
  const storage = memoryStorage({ access_token: "old", refresh_token: "r" });
  const server = fakeServer({ valid: "none" });
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => assert.fail(), fetchImpl: server.fetchImpl, storage });
  const results = await Promise.all([authFetch("/api/a/"), authFetch("/api/b/"), authFetch("/api/c/")]);
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  assert.equal(server.calls.filter((c) => c.url === "/api/refresh/").length, 1);
});

test("when the refresh token is refused too, the session ends", async () => {
  const storage = memoryStorage({ access_token: "old", refresh_token: "expired" });
  const server = fakeServer({ valid: "none", refreshStatus: 401 });
  let ended = 0;
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => ended++, fetchImpl: server.fetchImpl, storage });
  const res = await authFetch("/api/billing/passes/");
  assert.equal(res.status, 401);
  assert.equal(ended, 1);
});

test("a server hiccup during renewal keeps the user logged in", async () => {
  const storage = memoryStorage({ access_token: "old", refresh_token: "r" });
  const server = fakeServer({ valid: "none", refreshStatus: 503 });
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => assert.fail(), fetchImpl: server.fetchImpl, storage });
  const res = await authFetch("/api/billing/passes/");
  assert.equal(res.status, 401);
  assert.equal(storage.getItem("refresh_token"), "r");
});

test("logged-out requests are left alone", async () => {
  const storage = memoryStorage({});
  const server = fakeServer({ valid: "none" });
  const authFetch = createAuthFetch({ refreshUrl: "/api/refresh/", onSessionEnded: () => assert.fail(), fetchImpl: server.fetchImpl, storage });
  const res = await authFetch("/api/public/");
  assert.equal(res.status, 401);
  assert.equal(server.calls.length, 1);
  assert.equal(server.calls[0].auth, null);
});
