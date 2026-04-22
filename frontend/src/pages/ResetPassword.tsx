import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { withBackendPath } from "@/lib/env";

export default function ResetPassword() {
  const { uid, token } = useParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!uid || !token) {
      setMessage("Invalid reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      const res = await fetch(withBackendPath("/accounts/password-reset/confirm/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password }),
      });

      const data = await res.json();
      setMessage(data.message || data.error || "Password reset failed.");
    } catch (err) {
      console.error(err);
      setMessage("Error connecting to server");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-60" />
      <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-accent/30 blur-[140px]" />
      <div className="absolute right-0 bottom-10 h-72 w-72 rounded-full bg-primary/25 blur-[160px]" />

      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="grid w-full gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div className="space-y-6 text-left text-foreground">
            <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Set a new password
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
            </p>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">Secure your account again</h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Choose a strong password to regain access to your InsightPilot workspace.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-foreground/80">
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Stronger credentials
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Protected access
              </span>
              <span className="rounded-full bg-white/5 px-3 py-1 shadow-inner shadow-white/5">
                Verified link
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-white/10 via-white/5 to-transparent blur-3xl" />
            <form
              onSubmit={handleSubmit}
              className="relative z-10 space-y-5 rounded-3xl border border-white/10 bg-card/80 p-8 shadow-2xl backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">New password</h2>
                  <p className="text-sm text-muted-foreground">Must meet your account security rules.</p>
                </div>
                <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">
                  Secure
                </span>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Password</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Confirm password</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-base font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.01] hover:shadow-[0_18px_50px_-12px_rgba(86,173,255,0.55)] focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                Update password
              </button>

              {message && (
                <p className="rounded-lg bg-foreground/5 px-4 py-3 text-sm text-foreground/90 shadow-inner shadow-white/5">
                  {message}
                </p>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Back to{" "}
                <Link to="/login" className="font-semibold text-foreground hover:text-accent transition">
                  Log in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
