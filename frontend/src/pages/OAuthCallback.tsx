import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthBackdrop } from "@/components/auth/AuthBackdrop";
import { setAuthTokens } from "@/lib/auth";

// What each error from the server means, in plain words.
const ERROR_MESSAGES: Record<string, string> = {
  missing_code_or_state: "The sign-in was cancelled or didn't finish.",
  invalid_state: "The sign-in link expired. Please try again.",
  google_not_configured: "Google sign-in isn't set up yet.",
  facebook_not_configured: "Facebook sign-in isn't set up yet.",
  token_exchange_failed: "We couldn't confirm the sign-in with the provider. Please try again.",
  missing_access_token: "We couldn't confirm the sign-in with the provider. Please try again.",
  userinfo_failed: "We couldn't read your profile from the provider. Please try again.",
  missing_email: "Your account didn't share an email address. Allow email access, or sign up with email and password.",
  email_not_verified: "That Google account's email isn't verified yet. Verify it with Google, or use email and password.",
  missing_tokens: "The sign-in didn't finish. Please try again.",
};

export default function OAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The server puts everything after "#" (older links used "?").
    const params = new URLSearchParams(location.hash.replace(/^#/, "") || location.search);
    // Don't leave the tokens in the address bar or browser history.
    window.history.replaceState(null, "", location.pathname);

    const errorParam = params.get("error");
    if (errorParam) {
      setError(errorParam);
      return;
    }
    const access = params.get("access");
    const refresh = params.get("refresh");
    if (!access || !refresh) {
      setError("missing_tokens");
      return;
    }

    const next = params.get("next") || "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    setAuthTokens(access, refresh);
    navigate("/login", { replace: true, state: { from: { pathname: safeNext }, reason: "oauth" } });
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background">
      <AuthBackdrop />
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <div className="auth-rise neon-edge w-full rounded-3xl p-10 text-center shadow-2xl backdrop-blur">
          {error ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Sign-in didn't work</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again, or use email and password."}
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Back to log in
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Signing you in…</h1>
              <p className="mt-3 text-sm text-muted-foreground">This only takes a moment.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
