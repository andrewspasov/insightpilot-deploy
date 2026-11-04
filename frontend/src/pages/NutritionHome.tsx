import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Apple, ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play, RotateCcw, ScanLine } from "lucide-react";

import { useNutritionHomeMotion } from "@/hooks/use-nutrition-home-motion";
import { useNutritionCinematicTimeline } from "@/hooks/use-nutrition-cinematic-timeline";
import { formatNutritionNumber } from "@/lib/nutrition";
import { NUTRITION_STAGES, moveNutritionStage } from "@/lib/nutrition-experience";
import NutritionSplineRobot from "@/components/nutrition/NutritionSplineRobot";
import NutritionSpatialWorld from "@/components/nutrition/NutritionSpatialWorld";
import { calculateNutritionSample, GRAMS_PER_OUNCE, NUTRITION_SAMPLE_FOODS, type NutritionSampleUnit } from "@/lib/nutrition-preview";
import "./NutritionHome.css";

const nutritionDestination = { from: { pathname: "/tools/nutrition/logs" } };

function PortionLab() {
  const [foodId, setFoodId] = useState("chicken");
  const [amount, setAmount] = useState("150");
  const [unit, setUnit] = useState<NutritionSampleUnit>("g");
  const sample = calculateNutritionSample(foodId, amount, unit);

  const changeUnit = (nextUnit: NutritionSampleUnit) => {
    if (sample.valid) setAmount(String(Number((sample.grams / (nextUnit === "oz" ? GRAMS_PER_OUNCE : 1)).toFixed(4))));
    setUnit(nextUnit);
  };

  return (
    <div className="n-lab">
      <label className="n-food-field" htmlFor="scene-food">Sample food
        <select id="scene-food" value={foodId} onChange={(event) => setFoodId(event.target.value)}>
          {NUTRITION_SAMPLE_FOODS.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}
        </select>
      </label>
      <div className="n-portion-fields">
        <label htmlFor="scene-amount">Quantity
          <input id="scene-amount" type="number" inputMode="decimal" min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={!sample.valid} aria-describedby="scene-lab-note" />
        </label>
        <label htmlFor="scene-unit">Unit
          <select id="scene-unit" value={unit} onChange={(event) => changeUnit(event.target.value as NutritionSampleUnit)}>
            <option value="g">Grams (g)</option><option value="oz">Ounces (oz)</option>
          </select>
        </label>
      </div>
      <div className="n-lab-totals" aria-live="polite" aria-atomic="true">
        {[
          ["Calories", sample.calories, "kcal"], ["Protein", sample.protein, "g"],
          ["Carbs", sample.carbs, "g"], ["Fat", sample.fat, "g"],
        ].map(([label, value, suffix]) => (
          <div key={label}><span>{label}</span><strong>{sample.valid ? formatNutritionNumber(Number(value)) : "--"}<small>{suffix}</small></strong></div>
        ))}
      </div>
      <p id="scene-lab-note">{sample.valid ? "Illustrative demo. Nothing is logged." : "Enter a quantity greater than zero."}</p>
    </div>
  );
}

export default function NutritionHome() {
  const [stageIndex, setStageIndex] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusNextTitle = useRef(false);
  const { pageRef, motionActive, reducedMotion, toggleMotion } = useNutritionHomeMotion();
  const stage = NUTRITION_STAGES[stageIndex];
  const lastStage = stageIndex === NUTRITION_STAGES.length - 1;
  const move = (direction: number, focus = true) => {
    focusNextTitle.current = focus;
    setStageIndex((index) => moveNutritionStage(index, direction));
  };
  const advance = () => move(1);
  useNutritionCinematicTimeline(pageRef, stageIndex, setStageIndex, motionActive);

  useEffect(() => {
    if (focusNextTitle.current) {
      titleRef.current?.focus({ preventScroll: true });
      focusNextTitle.current = false;
    }
  }, [stageIndex]);

  useEffect(() => {
    const title = document.title;
    const alreadyActive = document.body.classList.contains("nutrition-scene-active");
    document.body.classList.add("nutrition-scene-active");
    document.title = "InsightPilot Nutrition | Meet Your Nutrition Co-Pilot";
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap";
    document.head.appendChild(font);
    return () => {
      document.title = title;
      font.remove();
      if (!alreadyActive) document.body.classList.remove("nutrition-scene-active");
    };
  }, []);

  return (
    <div className="nutrition-scene-home" ref={pageRef} data-motion={motionActive ? "active" : "paused"} data-stage={stage.id}>
      <a className="n-skip" href="#nutrition-experience">Skip to experience</a>
      <header className="n-header">
        <Link to="/" className="n-brand" aria-label="InsightPilot home">
          <span className="n-brand-icon"><Apple size={20} /></span>
          <span>InsightPilot<small>NUTRITION</small></span>
        </Link>
        <span className="n-header-caption">A NEW PERSPECTIVE ON EVERY BITE</span>
        <nav aria-label="Account navigation">
          <Link className="n-platform" to="/">Platform <ArrowUpRight size={14} /></Link>
          <Link to="/login" state={nutritionDestination}>Log in <ArrowUpRight size={15} /></Link>
        </nav>
      </header>

      <main id="nutrition-experience" className="n-experience" tabIndex={-1}>
        <div className="n-environment" aria-hidden="true">
          <NutritionSpatialWorld pageRef={pageRef} motionActive={motionActive} />
          <div className="n-starfield" /><div className="n-horizon" />
          <div className="n-grid-camera"><div className="n-floor-grid" /><div className="n-floor-ring n-floor-ring-one" /><div className="n-floor-ring n-floor-ring-two" /></div>
          <div className="n-light-column" /><div className="n-scanline" />
          <span className="n-world-word">NUTRITION</span>
          <div className="n-orbital n-orbital-one" /><div className="n-orbital n-orbital-two" />
          <div className="n-floating-world">
            <div className="n-floating-panel n-floating-panel-one"><span>01 / FOOD INTELLIGENCE</span><strong>Every bite, in focus.</strong><small>SEARCH / PORTIONS / MACROS</small></div>
            <div className="n-floating-panel n-floating-panel-two"><span>02 / LIVE INSIGHTS</span><strong>Before you log.</strong><div className="n-hologram-bars"><i /><i /><i /><i /><i /><i /><i /></div></div>
            <div className="n-floating-panel n-floating-panel-three"><span>03 / YOUR DIRECTION</span><strong>Small habits. Clearer trends.</strong><small>YOUR PACE / YOUR PROGRESS</small></div>
          </div>
        </div>

        <div className="n-actor-space">
          <NutritionSplineRobot stageIndex={stageIndex} motionActive={motionActive} pageRef={pageRef} />
          <div className="n-robot-coordinate" aria-hidden="true"><span>IP / COMPANION 01</span><span>SHOT / {String(stageIndex + 1).padStart(2, "0")}</span></div>
          {!lastStage && (
            <button type="button" className="n-hotspot" onClick={advance} aria-label={`Explore ${NUTRITION_STAGES[stageIndex + 1].label}`}>
              <span className="n-hotspot-target"><ScanLine size={19} /></span>
              <span>{stage.next}<ArrowRight size={14} /></span>
            </button>
          )}
          <div className="n-telemetry" key={`telemetry-${stage.id}`} aria-hidden="true">
            <span className="n-signal" />{stage.signal}<small>INSIGHTPILOT / NUTRITION</small>
          </div>
        </div>

        <div className="n-content-space">
          <div className="n-content" key={stage.id}>
            <p className="n-eyebrow"><span />{String(stageIndex + 1).padStart(2, "0")} / {stage.kicker}</p>
            <h1 className="n-title" ref={titleRef} tabIndex={-1}>{stage.title}<em>{stage.accent}</em></h1>
            <p className="n-description">{stage.description}</p>
            {stage.id === "portions" ? <PortionLab /> : (
              <div className="n-feature-readout"><span>{stage.detailLabel}</span><strong>{stage.detail}</strong></div>
            )}
            <div className="n-content-actions">
              {lastStage ? (
                <Link className="n-primary" to="/signup" state={nutritionDestination}>Start tracking <ArrowUpRight size={18} /></Link>
              ) : (
                <button type="button" className="n-primary" onClick={advance}>{stage.next} <ArrowRight size={18} /></button>
              )}
              {stageIndex === 0 || lastStage ? (
                <Link className="n-diary-link" to="/tools/nutrition/logs">Open diary <ArrowUpRight size={14} /></Link>
              ) : (
                <button type="button" className="n-back" onClick={() => move(-1)}><ArrowLeft size={14} /> Back</button>
              )}
            </div>
            {lastStage && <p className="n-access-note">Your InsightPilot account. Nutrition access required to save your diary.</p>}
          </div>
        </div>
        <p className="n-sr-only" role="status" aria-live="polite" aria-atomic="true">Step {stageIndex + 1} of {NUTRITION_STAGES.length}: {stage.label}.</p>
      </main>

      <footer className="n-controls">
        <div className="n-control-caption"><span />SCROLL OR CLICK TO EXPLORE<small>ONE SCENE. YOUR PACE.</small></div>
        <nav className="n-stages" aria-label="Experience steps">
          {NUTRITION_STAGES.map((item, index) => (
            <button type="button" key={item.id} onClick={() => setStageIndex(index)} aria-current={index === stageIndex ? "step" : undefined} aria-label={`Step ${index + 1}: ${item.label}`}>
              <span>{String(index + 1).padStart(2, "0")}</span><small>{item.label}</small>
            </button>
          ))}
        </nav>
        <div className="n-motion-controls">
          <button type="button" onClick={() => setStageIndex(0)} aria-label="Restart experience" title="Restart"><RotateCcw size={16} /></button>
          <button type="button" onClick={toggleMotion} disabled={reducedMotion} aria-pressed={motionActive} aria-label={reducedMotion ? "Your device prefers reduced motion" : motionActive ? "Pause animations" : "Enable animations"} title={reducedMotion ? "Reduced motion" : motionActive ? "Pause animations" : "Enable animations"}>{motionActive ? <Pause size={16} /> : <Play size={16} />}</button>
        </div>
        <div className="n-progress" aria-hidden="true"><span /></div>
      </footer>
    </div>
  );
}
