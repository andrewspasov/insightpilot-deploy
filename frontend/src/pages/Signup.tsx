import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CookieConsentDialog } from "@/components/CookieConsentDialog";
import { withBackendPath } from "@/lib/env";
import {
  clearNonEssentialCookies,
  CookieConsentStatus,
  getCookieConsentStatus,
  setCookieConsentStatus,
} from "@/lib/cookie-consent";
import { isAuthenticated, setAuthTokens } from "@/lib/auth";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [consentStatus, setConsentStatus] = useState<CookieConsentStatus | null>(null);
  const [hasTokens, setHasTokens] = useState<boolean>(isAuthenticated());
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    setConsentStatus(getCookieConsentStatus());
    setHasTokens(isAuthenticated());
  }, []);

  useEffect(() => {
    if (hasTokens && consentStatus) {
      navigate("/dashboard", { replace: true });
    } else if (hasTokens && consentStatus === null) {
      setShowConsentDialog(true);
    }
  }, [consentStatus, hasTokens, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(withBackendPath("/accounts/register/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();
      if (data.access && data.refresh) {
        setAuthTokens(data.access, data.refresh);
        setMessage("Account created successfully.");

        const existingConsent = getCookieConsentStatus();
        setConsentStatus(existingConsent);
        setHasTokens(true);

        if (existingConsent) {
          navigate("/dashboard", { replace: true });
        } else {
          setShowConsentDialog(true);
        }
        return;
      }

      setMessage(data.message || data.error || data.detail || "Unknown response");
    } catch (err) {
      console.error(err);
      setMessage("Error connecting to server");
    }
  };

  const handleOAuth = async (provider: "google" | "facebook") => {
    try {
      const res = await fetch(
        `${withBackendPath(`/accounts/oauth/${provider}/start/`)}?next=/dashboard`,
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
      <div className="absolute -right-24 top-16 h-64 w-64 rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute bottom-10 left-0 h-72 w-72 rounded-full bg-accent/30 blur-[160px]" />

      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="grid w-full gap-10 md:grid-cols-[0.95fr_1.05fr] md:items-center">
          <div className="order-2 space-y-6 rounded-3xl border border-white/10 bg-card/80 p-8 shadow-2xl backdrop-blur md:order-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  Start free
                  <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(86,173,255,0.7)]" />
                </p>
                <h1 className="mt-3 text-3xl font-semibold">Create your account</h1>
                <p className="text-sm text-muted-foreground">
                  Spin up your workspace and launch your first flow.
                </p>
              </div>
              <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">
                2 mins
              </span>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Username</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. andrej"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Email</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="andrej@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Password</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-base font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.01] hover:shadow-[0_18px_50px_-12px_rgba(86,173,255,0.55)] focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                Create account
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
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-foreground transition hover:text-primary">
                  Log in
                </Link>
              </p>
            </form>
          </div>

          <div className="order-1 space-y-6 text-left text-foreground md:order-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Guided launches
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
            </p>
            <h2 className="text-4xl font-bold leading-tight md:text-5xl">
              Design automations with clarity
            </h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              The same polished feel from the homepage follows you into your workspace. Build
              flows, invite teammates, and watch metrics update in real time.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Onboarding
                </p>
                <p className="mt-2 text-lg font-semibold">Fast setup</p>
                <p className="text-sm text-muted-foreground">
                  Guided flows help you ship an automation in minutes.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  Visibility
                </p>
                <p className="mt-2 text-lg font-semibold">Live metrics</p>
                <p className="text-sm text-muted-foreground">
                  See success and errors in one elegant console.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CookieConsentDialog
        open={showConsentDialog}
        onAccept={() => {
          setCookieConsentStatus("accepted");
          setConsentStatus("accepted");
          setShowConsentDialog(false);
          navigate("/dashboard", { replace: true });
        }}
        onDecline={() => {
          setCookieConsentStatus("declined");
          clearNonEssentialCookies();
          setConsentStatus("declined");
          setShowConsentDialog(false);
          navigate("/dashboard", { replace: true });
        }}
      />
    </div>
  );
}
