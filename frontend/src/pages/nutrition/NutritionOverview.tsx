import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  useNutritionInsights,
  useNutritionOverview,
  useUpdateNutritionProfile,
} from "@/hooks/use-nutrition";
import { useToolAccess } from "@/hooks/use-entitlements";
import { useToast } from "@/hooks/use-toast";
import { formatIsoDate, getTodayIsoDate, percentOfTarget } from "@/lib/nutrition";
import type { NutritionGoalType } from "@/types/nutrition";

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function NutritionOverview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isReadOnly } = useToolAccess("nutrition");
  const today = getTodayIsoDate();

  const overviewQuery = useNutritionOverview(today);
  const insightsQuery = useNutritionInsights(7);
  const updateProfile = useUpdateNutritionProfile();

  const [goalType, setGoalType] = useState<NutritionGoalType>("track");
  const [calories, setCalories] = useState("2000");
  const [protein, setProtein] = useState("150");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("70");

  useEffect(() => {
    const profile = overviewQuery.data?.profile;
    if (!profile) {
      return;
    }
    setGoalType(profile.goal_type);
    setCalories(String(profile.daily_calorie_target));
    setProtein(String(profile.protein_target_grams));
    setCarbs(String(profile.carbs_target_grams));
    setFat(String(profile.fat_target_grams));
  }, [overviewQuery.data?.profile]);

  const profile = overviewQuery.data?.profile;
  const totals = overviewQuery.data?.totals;

  const handleSaveTargets = async () => {
    try {
      await updateProfile.mutateAsync({
        goal_type: goalType,
        daily_calorie_target: Math.max(0, Math.round(toNumber(calories))),
        protein_target_grams: Math.max(0, toNumber(protein)),
        carbs_target_grams: Math.max(0, toNumber(carbs)),
        fat_target_grams: Math.max(0, toNumber(fat)),
      });
      toast({
        title: "Targets updated",
        description: "Your nutrition profile has been saved.",
      });
    } catch (error) {
      toast({
        title: "Could not update targets",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Nutrition Overview</h1>
          <p className="text-muted-foreground">
            Start from today’s totals, then jump into the diary when it’s time to log meals.
          </p>
        </div>
        <Button onClick={() => navigate("/tools/nutrition/logs")}>Open diary</Button>
      </div>

      {overviewQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading overview...</p>
          </CardContent>
        </Card>
      )}

      {overviewQuery.data && profile && totals && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardDescription>Calories</CardDescription>
                  <CardTitle>{totals.calories.toFixed(0)} kcal</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {overviewQuery.data.remaining.calories.toFixed(0)} kcal remaining today
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>Meals logged</CardDescription>
                  <CardTitle>{overviewQuery.data.entries_count}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Across {overviewQuery.data.meal_sections.filter((section) => section.entries.length > 0).length} meal
                    sections
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>Latest weight</CardDescription>
                  <CardTitle>
                    {overviewQuery.data.latest_weight_entry
                      ? `${overviewQuery.data.latest_weight_entry.weight_kg} kg`
                      : "No data"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {overviewQuery.data.latest_weight_entry
                      ? formatIsoDate(overviewQuery.data.latest_weight_entry.entry_date)
                      : "Log your first weigh-in from the diary"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>7-day adherence</CardDescription>
                  <CardTitle>{insightsQuery.data?.adherence_pct.toFixed(0) ?? "0"}%</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {insightsQuery.data?.days_on_target ?? 0} on-target day(s)
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Today’s macro progress</CardTitle>
                <CardDescription>{formatIsoDate(overviewQuery.data.date)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Protein</span>
                    <span className="font-medium">
                      {totals.protein_grams.toFixed(0)} / {profile.protein_target_grams.toFixed(0)}g
                    </span>
                  </div>
                  <Progress value={percentOfTarget(totals.protein_grams, profile.protein_target_grams)} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Carbs</span>
                    <span className="font-medium">
                      {totals.carbs_grams.toFixed(0)} / {profile.carbs_target_grams.toFixed(0)}g
                    </span>
                  </div>
                  <Progress value={percentOfTarget(totals.carbs_grams, profile.carbs_target_grams)} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fat</span>
                    <span className="font-medium">
                      {totals.fat_grams.toFixed(0)} / {profile.fat_target_grams.toFixed(0)}g
                    </span>
                  </div>
                  <Progress value={percentOfTarget(totals.fat_grams, profile.fat_target_grams)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>7-day summary</CardTitle>
                <CardDescription>{insightsQuery.data?.headline ?? "Loading..."}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">Average calories</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {insightsQuery.data?.averages.calories.toFixed(0) ?? "0"} kcal
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">Average protein</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {insightsQuery.data?.averages.protein_grams.toFixed(0) ?? "0"} g
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">Weight change</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {insightsQuery.data?.weight_change_kg.toFixed(1) ?? "0.0"} kg
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Targets and goals</CardTitle>
              <CardDescription>
                Keep these simple. You can adjust them anytime as your habits change.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={goalType}
                onChange={(event) => setGoalType(event.target.value as NutritionGoalType)}
              >
                <option value="track">Track only</option>
                <option value="maintain">Maintain</option>
                <option value="lose">Lose</option>
                <option value="gain">Gain</option>
              </select>

              <Input
                type="number"
                min="0"
                step="10"
                value={calories}
                onChange={(event) => setCalories(event.target.value)}
                placeholder="Daily calories"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={protein}
                onChange={(event) => setProtein(event.target.value)}
                placeholder="Protein target"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={carbs}
                onChange={(event) => setCarbs(event.target.value)}
                placeholder="Carbs target"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={fat}
                onChange={(event) => setFat(event.target.value)}
                placeholder="Fat target"
              />

              <Button
                className="w-full"
                onClick={handleSaveTargets}
                disabled={isReadOnly || updateProfile.isPending}
              >
                {updateProfile.isPending ? "Saving..." : "Save targets"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
