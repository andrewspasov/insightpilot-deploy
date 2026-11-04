// The neon backdrop behind every page: two drifting light clouds over a
// faint grid. Softer in light mode (see --backdrop-opacity).
export function NeonBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--backdrop-opacity)" }}
    >
      <div
        className="absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full blur-[90px]"
        style={{ background: "hsl(var(--primary) / 0.22)", animation: "neon-drift-a 16s ease-in-out infinite" }}
      />
      <div
        className="absolute -right-48 top-[45%] h-[38rem] w-[38rem] rounded-full blur-[100px]"
        style={{ background: "hsl(var(--secondary) / 0.22)", animation: "neon-drift-b 20s ease-in-out infinite" }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.06) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
    </div>
  );
}
