import { useNutritionProfile, useUpdateNutritionProfile } from "@/hooks/use-nutrition";
import type { UnitsPreference } from "@/types/plans";

/** The account's metric/US preference (shared with the mobile app). */
export function useUnits() {
  const profile = useNutritionProfile();
  const update = useUpdateNutritionProfile();
  const units: UnitsPreference = profile.data?.units ?? "metric";
  return {
    units,
    setUnits: (next: UnitsPreference) => update.mutateAsync({ units: next }),
    saving: update.isPending,
  };
}
