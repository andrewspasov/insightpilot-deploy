import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setAuthTokens } from "@/lib/auth";

export default function OAuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const access = params.get("access");
    const refresh = params.get("refresh");
    const nextPath = params.get("next") || "/dashboard";
    const errorParam = params.get("error");

    if (errorParam) {
      setError(errorParam);
      return;
    }

    if (!access || !refresh) {
      setError("missing_tokens");
      return;
    }

    setAuthTokens(access, refresh);

    navigate("/login", {
      replace: true,
      state: { from: { pathname: nextPath }, reason: "oauth" },
    });
  }, [location.search, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-60" />
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-accent/30 blur-[140px]" />
      <div className="absolute right-0 bottom-10 h-72 w-72 rounded-full bg-primary/25 blur-[160px]" />

      <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6">
        <div className="w-full rounded-3xl border border-white/10 bg-card/80 p-10 text-center shadow-2xl backdrop-blur">
          <h1 className="text-2xl font-semibold text-foreground">Finalizing sign-in</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We are syncing your account details and finishing the login process.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold">OAuth error: {error}</p>
              <p className="mt-2 text-muted-foreground">
                Please try again or use email + password.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-flex rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-white/30"
              >
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
