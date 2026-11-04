import { useCountUp } from "./useCountUp";

// A glass sphere that fills with neon "liquid" as the day's calories add up.
export function CalorieOrb({ eaten, goal, size = 200 }: { eaten: number; goal: number; size?: number }) {
  const fill = goal > 0 ? Math.max(0, Math.min(1, eaten / goal)) : 0;
  const over = goal > 0 && eaten > goal;
  const left = useCountUp(Math.abs(Math.round(goal - eaten)));
  const liquid = over
    ? "linear-gradient(180deg, #FDBA74 0%, #F97316 55%, #DB2777 100%)"
    : "linear-gradient(180deg, #22D3EE 0%, #6366F1 55%, #8B5CF6 100%)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(eaten)} of ${goal} kcal eaten`}
    >
      <div
        className="absolute -inset-6 rounded-full"
        style={{
          background: `radial-gradient(circle, ${over ? "rgba(251,146,60,0.4)" : "rgba(34,211,238,0.38)"} 0%, rgba(139,92,246,0.22) 45%, transparent 70%)`,
          animation: "neon-halo 4s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -inset-2.5 rounded-full border border-dashed border-violet-400/50"
        style={{ animation: "neon-spin 16s linear infinite" }}
      >
        <span className="absolute -top-1 left-1/2 block h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_12px_#E879F9]" />
      </div>
      <div
        className="absolute inset-0 overflow-hidden rounded-full border border-cyan-200/60"
        style={{
          background: liquid,
          boxShadow:
            "0 0 34px rgba(34,211,238,0.55), inset -16px -22px 36px rgba(20,8,60,0.75), inset 10px 12px 26px rgba(255,255,255,0.12)",
        }}
      >
        {/* The empty glass sits above the liquid; its wavy edge is the surface. */}
        <div
          className="absolute left-0 w-[200%] transition-[height] duration-[1400ms] ease-out"
          style={{ top: 0, height: `${(1 - fill) * 100}%` }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
            style={{ animation: "neon-wave 3.2s linear infinite" }}
          >
            <path d={WAVE} fill="#090C1C" fillOpacity="0.95" />
          </svg>
        </div>
        <div className="absolute left-[18%] top-[14%] h-[17%] w-[32%] -rotate-[30deg] rounded-full bg-white/25 blur-md" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-extrabold tracking-tight text-white"
          style={{ fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif", textShadow: `0 0 16px ${over ? "#FDBA74" : "#A5F3FC"}` }}
        >
          {Math.round(left).toLocaleString()}
        </span>
        <span className="text-xs text-cyan-50">{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}

// Two wave periods across 400 units; the svg slides left by half to loop.
const WAVE = (() => {
  let d = "M0 0 L400 0 L400 100";
  for (let x = 400; x >= 0; x -= 10) d += ` L${x} ${100 + Math.sin((x / 200) * Math.PI * 2) * 6}`;
  return `${d} Z`;
})();
