import { useState, type CSSProperties } from "react";

import { NUTRITION_STAGES, ROBOT_ASSETS, ROBOT_VIEWS, resolveRobotView, type RobotView } from "@/lib/nutrition-experience";

export default function NutritionRobotCinematic({ stageIndex }: { stageIndex: number }) {
  const [loaded, setLoaded] = useState<RobotView[]>([]);
  const [failed, setFailed] = useState<RobotView[]>([]);
  const view = resolveRobotView(NUTRITION_STAGES[stageIndex].view, loaded);
  const unavailable = !view && failed.length === ROBOT_VIEWS.length;
  const complete = loaded.length === ROBOT_VIEWS.length;

  return (
    <div className="n-cinematic-robot" data-view={view ?? "loading"} data-blending={complete}>
      <div className="n-art-camera">
        <div className="n-art-parallax">
          <div className="n-art-drift" role="img" aria-label={view ? `Silver nutrition companion holding a cyan tablet, ${view} camera view` : "Nutrition companion preview"}>
            {ROBOT_VIEWS.map((angle, index) => (
              <img
                key={angle}
                className="n-robot-art"
                data-visible={view === angle}
                style={{ "--shot-opacity": `var(--shot-${index}, ${stageIndex === index ? 1 : 0})` } as CSSProperties}
                src={ROBOT_ASSETS[angle]}
                alt=""
                aria-hidden="true"
                width={1024}
                height={1536}
                loading="eager"
                decoding="async"
                onLoad={() => setLoaded((views) => views.includes(angle) ? views : [...views, angle])}
                onError={() => {
                  setFailed((views) => views.includes(angle) ? views : [...views, angle]);
                  setLoaded((views) => views.filter((item) => item !== angle));
                }}
              />
            ))}
          </div>
        </div>
      </div>
      {!view && <p className="n-art-status" role="status">{unavailable ? "Robot preview unavailable. You can still explore below." : "Preparing your companion..."}</p>}
      <span className="n-art-caption">CINEMATIC IMAGE EXPERIENCE<small>SCROLL / SWIPE / CLICK</small></span>
    </div>
  );
}
