import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CookieConsentDialog } from "@/components/CookieConsentDialog";
import { CookieConsentStatus, clearNonEssentialCookies, getCookieConsentStatus, setCookieConsentStatus } from "@/lib/cookie-consent";
import { isAuthenticated, setAuthTokens } from "@/lib/auth";
import { withBackendPath } from "@/lib/env";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage]   = useState("");
  const [consentStatus, setConsentStatus] = useState<CookieConsentStatus | null>(null);
  const [hasTokens, setHasTokens] = useState<boolean>(isAuthenticated());
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // If user was sent here from a protected page (like /dashboard),
  // Take them back there after login. Otherwise go to /dashboard.
  const from =
    (location.state as any)?.from?.pathname || "/dashboard";

  useEffect(() => {
    setConsentStatus(getCookieConsentStatus());
    setHasTokens(isAuthenticated());
  }, []);

  // If tokens exist and consent already provided, bounce to the app.
  useEffect(() => {
    if (hasTokens && consentStatus) {
      navigate(from, { replace: true });
    } else if (hasTokens && consentStatus === null) {
      // Tokens exist but no recorded consent, so prompt.
      setShowConsentDialog(true);
    }
  }, [hasTokens, consentStatus, navigate, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(withBackendPath("/api/login/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.access) {
        setAuthTokens(data.access, data.refresh);

        // Optional message
        setMessage("Login successful!");

        const existingConsent = getCookieConsentStatus();
        setConsentStatus(existingConsent);
        setHasTokens(true);

        if (existingConsent) {
          navigate(from, { replace: true });
        } else {
          setShowConsentDialog(true);
        }
      } else {
        setMessage(data.detail || data.error || "Login failed");
      }
    } catch (err) {
      console.error(err);
      setMessage("Error connecting to server");
    }
  };

  const handleOAuth = async (provider: "google" | "facebook") => {
    try {
      const res = await fetch(
        `${withBackendPath(`/accounts/oauth/${provider}/start/`)}?next=${encodeURIComponent(from)}`
      );
      const data = await res.json();
      if (data.authorize_url) {
        window.location.href = data.authorize_url;
      } else {
        setMessage(data.detail || "Unable to start OAuth flow.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Error connecting to server");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-60" />
      <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-accent/30 blur-[140px]" />
      <div className="absolute right-0 bottom-10 h-72 w-72 rounded-full bg-primary/25 blur-[160px]" />

      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="grid w-full gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="space-y-6 text-left text-foreground">
            <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Welcome back
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
            </p>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Rejoin your InsightPilot workspace
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Pick up where you left off with dashboards, automations, and live status for your flows.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-foreground/80">
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Secure JWT login
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Single workspace view
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Token refresh ready
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-white/10 via-white/5 to-transparent blur-3xl" />
            <form
              onSubmit={handleLogin}
              className="relative z-10 space-y-5 rounded-3xl border border-white/10 bg-card/80 p-8 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Log in</h2>
                  <p className="text-sm text-muted-foreground">
                    Access your automations in seconds.
                  </p>
                </div>
                <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">
                  Secure
                </span>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">
                  Username
                </label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="e.g. andrej"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="Your secret"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-foreground/80 hover:text-accent transition"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-base font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.01] hover:shadow-[0_18px_50px_-12px_rgba(86,173,255,0.55)] focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                Continue
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-[0.2em] text-foreground/50">
                  Or continue with
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleOAuth("google")}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-white/30 hover:bg-white/10"
                >
                  Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth("facebook")}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-white/30 hover:bg-white/10"
                >
                  Continue with Facebook
                </button>
              </div>

              {message && (
                <p className="rounded-lg bg-foreground/5 px-4 py-3 text-sm text-foreground/90 shadow-inner shadow-white/5">
                  {message}
                </p>
              )}

              <p className="text-center text-sm text-muted-foreground">
                New here?{" "}
                <Link
                  to="/signup"
                  className="font-semibold text-foreground hover:text-accent transition"
                >
                  Create an account
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>

      <CookieConsentDialog
        open={showConsentDialog}
        onAccept={() => {
          setCookieConsentStatus("accepted");
          setConsentStatus("accepted");
          setShowConsentDialog(false);
          navigate(from, { replace: true });
        }}
        onDecline={() => {
          setCookieConsentStatus("declined");
          clearNonEssentialCookies();
          setConsentStatus("declined");
          setShowConsentDialog(false);
          navigate(from, { replace: true });
        }}
      />
    </div>
  );
}
