import { useEffect, useState } from "react";

const COLORS = ["#22D3EE", "#E879F9", "#A78BFA", "#4ADE80", "#FDE68A", "#67E8F9"];
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const distance = 110 + (i % 3) * 40;
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance * 0.7, color: COLORS[i % COLORS.length], delay: (i % 4) * 40 };
});

// A neon burst when a daily goal is reached, shown once per goal per day.
export function GoalCelebration({ goalKey, reached, message }: { goalKey: string; reached: boolean; message: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!reached) return;
    const key = `celebrated-${goalKey}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {
      // Without storage it may celebrate again on reload; harmless.
    }
    setShow(true);
    const timer = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(timer);
  }, [reached, goalKey]);

  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" role="status">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="absolute h-2 w-2 rounded-full"
          style={
            {
              background: s.color,
              boxShadow: `0 0 10px ${s.color}`,
              "--dx": `${s.dx}px`,
              "--dy": `${s.dy}px`,
              animation: `neon-burst 1.4s cubic-bezier(.2,.8,.2,1) ${s.delay}ms both`,
            } as React.CSSProperties
          }
        />
      ))}
      <span className="rounded-2xl border border-green-400/60 bg-card/95 px-5 py-3 text-lg font-bold text-green-200 shadow-[0_0_24px_rgba(74,222,128,0.4)] [text-shadow:0_0_14px_rgba(74,222,128,0.9)]">
        {message}
      </span>
    </div>
  );
}
