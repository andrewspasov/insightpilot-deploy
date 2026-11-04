import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { NUTRITION_STAGES } from "@/lib/nutrition-experience";
import type { RobotRenderer, RobotRenderStatus } from "@/lib/nutrition-robot-renderer";

type Props = { stageIndex: number; motionActive: boolean; hotspotRef: RefObject<HTMLButtonElement> };

export default function NutritionRobot3D({ stageIndex, motionActive, hotspotRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RobotRenderer | null>(null);
  const liveProps = useRef({ stageIndex, motionActive });
  liveProps.current = { stageIndex, motionActive };
  const [status, setStatus] = useState<RobotRenderStatus | "loading">("loading");
  const [attempt, setAttempt] = useState(0);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    // Load mesh/shader code only when this public experience is mounted.
    import("@/lib/nutrition-robot-renderer").then(({ createNutritionRobotRenderer }) => {
      if (disposed || !canvasRef.current) return;
      const stage = NUTRITION_STAGES[liveProps.current.stageIndex];
      try {
        rendererRef.current = createNutritionRobotRenderer(canvasRef.current,
          { yaw: stage.cameraYaw, pitch: stage.cameraPitch, zoom: stage.zoom }, liveProps.current.motionActive,
          (next) => { if (!disposed) setStatus(next); },
          (x, y) => {
            const hotspot = hotspotRef.current;
            if (hotspot) { hotspot.style.left = `${x}%`; hotspot.style.top = `${y}%`; }
          });
      } catch { setStatus("fallback"); }
    }).catch(() => { if (!disposed) setStatus("fallback"); });
    return () => { disposed = true; rendererRef.current?.dispose(); rendererRef.current = null; };
  }, [attempt, hotspotRef]);

  useEffect(() => {
    const stage = NUTRITION_STAGES[stageIndex];
    rendererRef.current?.setCamera({ yaw: stage.cameraYaw, pitch: stage.cameraPitch, zoom: stage.zoom });
  }, [stageIndex]);

  useEffect(() => { rendererRef.current?.setMotion(motionActive); }, [motionActive]);

  useEffect(() => {
    if (status !== "ready" && hotspotRef.current) {
      hotspotRef.current.style.removeProperty("left");
      hotspotRef.current.style.removeProperty("top");
    }
  }, [status, hotspotRef]);

  return (
    <div className="n-robot-3d" data-render-status={status}>
      <canvas ref={canvasRef} className="n-robot-canvas" tabIndex={status === "ready" ? 0 : -1}
        role="img" aria-label="Interactive silver nutrition robot holding a glowing tablet" aria-describedby="robot-orbit-help" aria-hidden={status !== "ready"} />
      {status === "loading" && <p className="n-art-status" role="status">Building your 3D co-pilot...</p>}
      {status === "fallback" && (
        <div className="n-3d-fallback">
          {!fallbackFailed && <img src="/nutrition-scene/robot-front.webp" alt="Silver nutrition robot holding a glowing tablet" onError={() => setFallbackFailed(true)} />}
          <div className="n-fallback-message" role="status"><span>3D unavailable. Showing a static preview.</span><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry 3D</button></div>
        </div>
      )}
      <div className="n-orbit-controls" hidden={status !== "ready"}>
        <button type="button" onClick={() => rendererRef.current?.rotateBy(-0.3)} aria-label="Rotate robot view left"><ArrowLeft size={14} /></button>
        <span id="robot-orbit-help">Drag to orbit<small>Arrow keys when focused. Home to reset.</small></span>
        <button type="button" onClick={() => rendererRef.current?.rotateBy(0.3)} aria-label="Rotate robot view right"><ArrowRight size={14} /></button>
        <button type="button" onClick={() => rendererRef.current?.resetOrbit()} aria-label="Reset robot view"><RotateCcw size={13} /></button>
      </div>
    </div>
  );
}
