import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  imageUrls: string[];
  alt: string;
  /** Alternate the start and end photos to show the movement. */
  animate?: boolean;
  className?: string;
};

const FRAME_MS = 1100;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** free-exercise-db ships two photos per exercise; cross-fading them reads as a simple animation. */
export function ExerciseImage({ imageUrls, alt, animate = false, className }: Props) {
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const frames = imageUrls.slice(0, 2);
  const canAnimate = animate && frames.length === 2 && !failed && !prefersReducedMotion();

  useEffect(() => {
    if (!canAnimate) return;
    const timer = setInterval(() => setFrame((f) => 1 - f), FRAME_MS);
    return () => clearInterval(timer);
  }, [canAnimate]);

  if (!frames.length || failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border bg-muted text-muted-foreground", className)}>
        <Activity className="h-1/3 w-1/3" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-white", className)}>
      <img
        src={frames[0]}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {canAnimate && (
        <img
          src={frames[1]}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            frame === 1 ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
