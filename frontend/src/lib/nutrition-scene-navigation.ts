// A trackpad's momentum tail must not skip several chapters after one swipe.
export function createNutritionScrollGesture() {
  let lastTime = -Infinity;
  let amount = 0;
  let direction = 0;
  let reverseAmount = 0;
  let consumed = false;

  return {
    push(delta: number, now: number): number {
      if (!Number.isFinite(delta) || !Number.isFinite(now) || Math.abs(delta) < 0.5) return 0;
      if (now - lastTime > 180) { amount = 0; direction = 0; reverseAmount = 0; consumed = false; }
      lastTime = now;
      const nextDirection = Math.sign(delta);
      if (consumed) {
        if (nextDirection === direction) { reverseAmount = 0; return 0; }
        // A deliberate reversal is a new intent, not part of the momentum tail.
        reverseAmount += Math.abs(delta);
        if (reverseAmount < 48) return 0;
        direction = nextDirection;
        reverseAmount = 0;
        return direction;
      }
      if (nextDirection !== direction) { amount = 0; direction = nextDirection; }
      amount += Math.abs(delta);
      if (amount < 48) return 0;
      consumed = true;
      return direction;
    },
    consume() { consumed = true; amount = 0; reverseAmount = 0; },
  };
}

export function nutritionWheelPixels(delta: number, mode: number, height: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
}
