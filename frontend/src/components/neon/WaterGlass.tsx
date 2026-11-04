// A glass that fills with glowing water, with a moving wave on top.
export function WaterGlass({ ml, target, width = 40, height = 56 }: { ml: number; target: number; width?: number; height?: number }) {
  const fill = target > 0 ? Math.max(0, Math.min(1, ml / target)) : 0;
  return (
    <div
      role="img"
      aria-label={`Water ${Math.round(fill * 100)} percent of goal`}
      className="relative shrink-0 overflow-hidden rounded-b-xl rounded-t-md border border-cyan-200/60 shadow-[0_0_14px_rgba(34,211,238,0.5)]"
      style={{ width, height, background: "linear-gradient(180deg, #67E8F9, #0891B2)" }}
    >
      <div className="absolute left-0 top-0 w-[200%] transition-[height] duration-1000 ease-out" style={{ height: `${(1 - fill) * 100}%` }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          style={{ animation: "neon-wave 2.4s linear infinite" }}
        >
          <path d={WAVE} className="fill-card" />
        </svg>
      </div>
      <span className="absolute bottom-1.5 left-1 top-1 w-[3px] rounded bg-white/35" />
    </div>
  );
}

const WAVE = (() => {
  let d = "M0 0 L400 0 L400 100";
  for (let x = 400; x >= 0; x -= 10) d += ` L${x} ${100 + Math.sin((x / 200) * Math.PI * 2) * 5}`;
  return `${d} Z`;
})();
