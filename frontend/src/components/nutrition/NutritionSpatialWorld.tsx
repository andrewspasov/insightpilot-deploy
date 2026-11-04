import { useEffect, useRef, useState, type RefObject } from "react";

export default function NutritionSpatialWorld({ pageRef, motionActive }: { pageRef: RefObject<HTMLDivElement>; motionActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    let disposed = false;
    let renderer: { dispose: () => void } | null = null;
    const lost = (event: Event) => { event.preventDefault(); renderer?.dispose(); setAvailable(false); };
    const restored = () => setAttempt((value) => value + 1);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    import("@/lib/nutrition-spatial-renderer").then(({ createNutritionSpatialRenderer }) => {
      if (disposed) return;
      renderer = createNutritionSpatialRenderer(canvas, page, motionActive);
      setAvailable(true);
    }).catch(() => { if (!disposed) setAvailable(false); });
    return () => {
      disposed = true;
      renderer?.dispose();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [pageRef, motionActive, attempt]);
  return <canvas ref={canvasRef} className="n-spatial-canvas" data-available={available} aria-hidden="true" />;
}
