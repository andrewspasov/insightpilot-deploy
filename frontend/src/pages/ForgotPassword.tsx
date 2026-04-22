import { useState } from "react";
import { Link } from "react-router-dom";
import { withBackendPath } from "@/lib/env";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setIsSending(true);

    try {
      const res = await fetch(withBackendPath("/accounts/password-reset/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setMessage(data.message || data.error || "Check your email for a reset link.");
    } catch (err) {
      console.error(err);
      setMessage("Error connecting to server");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-60" />
      <div className="absolute -right-24 top-16 h-64 w-64 rounded-full bg-primary/25 blur-[140px]" />
      <div className="absolute left-0 bottom-10 h-72 w-72 rounded-full bg-accent/30 blur-[160px]" />

      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="grid w-full gap-10 md:grid-cols-[0.95fr_1.05fr] md:items-center">
          <div className="order-2 space-y-6 rounded-3xl border border-white/10 bg-card/80 p-8 shadow-2xl backdrop-blur md:order-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  Password reset
                  <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
                </p>
                <h1 className="mt-3 text-3xl font-semibold">Reset your password</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your account email to receive a reset link.
                </p>
              </div>
              <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">
                1 step
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground/90">Email</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-foreground shadow-inner shadow-white/5 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSending}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-base font-semibold text-primary-foreground shadow-lg transition hover:scale-[1.01] hover:shadow-[0_18px_50px_-12px_rgba(86,173,255,0.55)] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send reset link"}
              </button>

              {message && (
                <p className="rounded-lg bg-foreground/5 px-4 py-3 text-sm text-foreground/90 shadow-inner shadow-white/5">
                  {message}
                </p>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link to="/login" className="font-semibold text-foreground hover:text-primary transition">
                  Log in
                </Link>
              </p>
            </form>
          </div>

          <div className="order-1 space-y-6 text-left text-foreground md:order-2">
            <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              Secure access
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(86,173,255,0.7)]" />
            </p>
            <h2 className="text-4xl font-bold leading-tight md:text-5xl">Get back to your workspace</h2>
            <p className="max-w-xl text-lg text-muted-foreground">
              We'll email a time-sensitive reset link so you can regain access fast.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Security</p>
                <p className="mt-2 text-lg font-semibold">Tokenized link</p>
                <p className="text-sm text-muted-foreground">Links expire to keep your account safe.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Support</p>
                <p className="mt-2 text-lg font-semibold">Need help?</p>
                <p className="text-sm text-muted-foreground">Contact support if you don’t see an email.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isSending && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative flex h-40 w-40 items-center justify-center">
            <div
              className="absolute h-40 w-40 animate-spin rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(37, 99, 235, 0.9), rgba(20, 184, 166, 0.9), rgba(37, 99, 235, 0.9))",
                filter: "blur(0.5px)",
              }}
            />
            <div
              className="absolute h-32 w-32 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.2) 35%, rgba(15, 23, 42, 0.2) 60%, rgba(15, 23, 42, 0.4) 100%)",
                boxShadow:
                  "0 18px 60px rgba(37, 99, 235, 0.35), inset 0 0 30px rgba(255,255,255,0.35)",
                transform: "translateZ(0)",
              }}
            />
            <div className="absolute h-20 w-20 rounded-full bg-background/70 backdrop-blur-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
