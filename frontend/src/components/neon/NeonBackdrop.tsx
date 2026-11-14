import { useEffect, useRef } from "react";

// The neon backdrop behind every page: two light clouds wandering very slowly
// over a faint grid, and every few seconds a soft ripple that makes the grid's
// boxes lift and glow as it passes. Softer in light mode (see --backdrop-opacity).

const CELL = 36; // must match the grid's background-size
const RIPPLE_SPEED = 170; // px per second
const RIPPLE_WIDTH = 110; // px, how wide the wave band is
const RIPPLE_LIFE = 5.5; // seconds a ripple lasts
const RIPPLE_EVERY = [3.5, 7]; // seconds between ripples (random within)

type Ripple = { x: number; y: number; born: number };

function GridRipples() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDraw = 0;
    let nextRipple = performance.now() + 1200;
    const ripples: Ripple[] = [];
    // The theme's accent as "H S% L%", read once and on theme changes.
    let primary = "190 90% 55%";
    const readColor = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      if (value) primary = value;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (now: number) => {
      ripples.push({ x: Math.random() * width, y: Math.random() * height, born: now });
      const [min, max] = RIPPLE_EVERY;
      nextRipple = now + (min + Math.random() * (max - min)) * 1000;
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 33) return; // ~30 fps is plenty for a backdrop
      lastDraw = now;
      if (now >= nextRipple) spawn(now);

      ctx.clearRect(0, 0, width, height);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        const age = (now - ripple.born) / 1000;
        if (age > RIPPLE_LIFE) {
          ripples.splice(i, 1);
          continue;
        }
        const radius = age * RIPPLE_SPEED;
        const fade = Math.sin((Math.PI * age) / RIPPLE_LIFE); // in, then out
        // Only visit the cells near the ring.
        const reach = radius + RIPPLE_WIDTH;
        const minCol = Math.max(0, Math.floor((ripple.x - reach) / CELL));
        const maxCol = Math.min(Math.ceil(width / CELL), Math.ceil((ripple.x + reach) / CELL));
        const minRow = Math.max(0, Math.floor((ripple.y - reach) / CELL));
        const maxRow = Math.min(Math.ceil(height / CELL), Math.ceil((ripple.y + reach) / CELL));
        for (let col = minCol; col <= maxCol; col++) {
          for (let row = minRow; row <= maxRow; row++) {
            const cx = col * CELL + CELL / 2;
            const cy = row * CELL + CELL / 2;
            const distance = Math.hypot(cx - ripple.x, cy - ripple.y);
            const band = 1 - Math.abs(distance - radius) / (RIPPLE_WIDTH / 2);
            if (band <= 0) continue;
            const strength = band * band * fade;
            const lift = strength * 2.5; // px the box "jumps" up
            ctx.fillStyle = `hsl(${primary} / ${(0.06 * strength).toFixed(3)})`;
            ctx.strokeStyle = `hsl(${primary} / ${(0.22 * strength).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(col * CELL + 2, row * CELL + 2 - lift, CELL - 4, CELL - 4, 4);
            else ctx.rect(col * CELL + 2, row * CELL + 2 - lift, CELL - 4, CELL - 4);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const themeObserver = new MutationObserver(readColor);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    readColor();
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

export function NeonBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--backdrop-opacity)" }}
    >
      <div className="neon-wander-a absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full blur-[90px]" style={{ background: "hsl(var(--primary) / 0.22)" }} />
      <div className="neon-wander-b absolute -right-48 top-[45%] h-[38rem] w-[38rem] rounded-full blur-[100px]" style={{ background: "hsl(var(--secondary) / 0.22)" }} />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.06) 1px, transparent 1px)",
          backgroundSize: `${CELL}px ${CELL}px`,
        }}
      />
      <GridRipples />
    </div>
  );
}
