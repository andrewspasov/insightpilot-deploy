import { cn } from "@/lib/utils";

// The coach: a glowing glass orb with blinking eyes, a halo and a spinning ring.
export function CoachMascot({ size = 88, thinking = false, ring = true, className }: { size?: number; thinking?: boolean; ring?: boolean; className?: string }) {
  const eyeW = Math.max(4, size * 0.1);
  const eyeH = Math.max(6, size * 0.17);
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size, perspective: 400, animation: "neon-bob 3s ease-in-out infinite" }}
      role="img"
      aria-label={thinking ? "Coach is thinking" : "Coach"}
    >
      <div
        className="absolute rounded-full"
        style={{
          inset: -size * 0.22,
          background: "radial-gradient(circle, rgba(34,211,238,0.45) 0%, rgba(139,92,246,0.28) 45%, transparent 70%)",
          animation: `neon-halo ${thinking ? 0.9 : 4}s ease-in-out infinite`,
        }}
      />
      {ring && (
        <div
          className="absolute rounded-[50%] border-2 border-fuchsia-400/80 shadow-[0_0_14px_rgba(232,121,249,0.7)]"
          style={{ left: -size * 0.17, right: -size * 0.17, top: size * 0.36, height: size * 0.3, animation: "neon-ring 6s linear infinite" }}
        />
      )}
      <div
        className="absolute inset-0 flex items-center justify-center rounded-full"
        style={{
          gap: size * 0.14,
          background: "radial-gradient(circle at 32% 28%, #ECFEFF 0%, #67E8F9 18%, #22D3EE 38%, #7C3AED 78%, #2E1065 100%)",
          boxShadow: "inset -10px -12px 22px rgba(46,16,101,0.85), 0 0 30px rgba(124,58,237,0.75), 0 0 60px rgba(34,211,238,0.3)",
        }}
      >
        {[0, 1].map((i) => (
          <span
            key={i}
            className="block rounded-full bg-cyan-50 shadow-[0_0_10px_#ECFEFF]"
            style={{ width: eyeW, height: eyeH, animation: "neon-blink 4.5s ease-in-out infinite" }}
          />
        ))}
      </div>
    </div>
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Coach is thinking">
      {["#67E8F9", "#A78BFA", "#E879F9"].map((color, i) => (
        <span
          key={color}
          className="block h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}`, animation: `neon-dot 1.1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </span>
  );
}
