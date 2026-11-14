import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Fixed positions so the specks don't jump around between renders.
const SPECKS = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 53 + 7) % 100,
  size: 2 + (i % 3),
  delay: (i * 0.7) % 9,
  duration: 9 + (i % 5) * 2,
}));

/**
 * Animated background for the account pages (log in, sign up, password
 * reset): drifting colour glows, a slowly moving neon grid and floating light
 * specks, plus a "Back to homepage" button.
 */
export function AuthBackdrop() {
  return (
    <>
      <div className="auth-backdrop" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-hero animate-gradient opacity-25" />
        <div className="auth-grid" />
        <div className="auth-aurora auth-aurora-a" />
        <div className="auth-aurora auth-aurora-b" />
        <div className="auth-aurora auth-aurora-c" />
        {SPECKS.map((speck, i) => (
          <span
            key={i}
            className="auth-speck"
            style={{
              left: `${speck.left}%`,
              top: `${speck.top}%`,
              width: speck.size,
              height: speck.size,
              animationDelay: `${speck.delay}s`,
              animationDuration: `${speck.duration}s`,
            }}
          />
        ))}
      </div>
      <Link to="/" className="auth-home-link">
        <ArrowLeft className="h-4 w-4" />
        Back to homepage
      </Link>
    </>
  );
}
