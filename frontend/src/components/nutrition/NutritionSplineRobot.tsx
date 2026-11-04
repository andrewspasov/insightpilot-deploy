import { useEffect, useRef, useState, type RefObject } from "react";
import { RotateCcw } from "lucide-react";
import { createNutritionSplineController, type SplineStatus } from "@/lib/nutrition-spline-controller";

type Props = { stageIndex: number; motionActive: boolean; pageRef: RefObject<HTMLDivElement> };

export default function NutritionSplineRobot({ stageIndex, motionActive, pageRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ReturnType<typeof createNutritionSplineController> | null>(null);
  const latest = useRef({ stageIndex, motionActive });
  latest.current = { stageIndex, motionActive };
  const [status, setStatus] = useState<SplineStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    setStatus("loading");
    const controller = createNutritionSplineController(canvas, container, {
      position: Number(pageRef.current?.dataset.scenePosition ?? latest.current.stageIndex), motionActive: latest.current.motionActive,
    }, setStatus);
    controllerRef.current = controller;
    const page = pageRef.current;
    const updateCamera = () => controller.setPosition(Number(page?.dataset.scenePosition ?? latest.current.stageIndex));
    page?.addEventListener("nutrition-scene-frame", updateCamera);
    return () => {
      page?.removeEventListener("nutrition-scene-frame", updateCamera);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [attempt, pageRef]);

  useEffect(() => { controllerRef.current?.setMotion(motionActive); }, [motionActive]);

  return (
    <div className="n-spline-robot" data-render-status={status}>
      <div className="n-spline-viewport" ref={containerRef}>
        <canvas key={attempt} ref={canvasRef} className="n-spline-canvas" role="img"
          aria-label="3D Spline robot companion" aria-hidden={status !== "ready"} />
      </div>
      {status === "loading" && <p className="n-spline-status" role="status">Loading 3D companion...</p>}
      {status === "fallback" && (
        <div className="n-spline-status" role="status">
          <span>3D companion unavailable. Please retry.</span>
          <button type="button" onClick={() => setAttempt(value => value + 1)} aria-label="Retry 3D companion" title="Retry 3D"><RotateCcw size={14} /></button>
        </div>
      )}
    </div>
  );
}
