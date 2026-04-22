import { useEffect, useState } from "react";

import { AddFoodDialog } from "@/components/nutrition/AddFoodDialog";
import { EditEntryDialog } from "@/components/nutrition/EditEntryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useCreateWeightEntry, useNutritionOverview } from "@/hooks/use-nutrition";
import { useToolAccess } from "@/hooks/use-entitlements";
import { useToast } from "@/hooks/use-toast";
import {
  formatIsoDate,
  formatQuantityWithUnit,
  getTodayIsoDate,
  shiftIsoDate,
  percentOfTarget,
} from "@/lib/nutrition";
import type { NutritionEntry, NutritionMealType } from "@/types/nutrition";

function MacroProgressRow({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value.toFixed(0)} / {target.toFixed(0)}g
        </span>
      </div>
      <Progress value={percentOfTarget(value, target)} />
    </div>
  );
}

export default function NutritionLogs() {
  const { toast } = useToast();
  const { isReadOnly } = useToolAccess("nutrition");
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeMealType, setActiveMealType] = useState<NutritionMealType>("breakfast");
  const [editingEntry, setEditingEntry] = useState<NutritionEntry | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [weightNote, setWeightNote] = useState("");

  const overviewQuery = useNutritionOverview(selectedDate);
  const createWeightEntry = useCreateWeightEntry();

  useEffect(() => {
    if (!overviewQuery.data?.weight_entry) {
      setWeightKg("");
      setWeightNote("");
      return;
    }
    setWeightKg(String(overviewQuery.data.weight_entry.weight_kg));
    setWeightNote(overviewQuery.data.weight_entry.note ?? "");
  }, [overviewQuery.data?.weight_entry]);

  const profile = overviewQuery.data?.profile;

  const handleOpenAddDialog = (mealType: NutritionMealType) => {
    setActiveMealType(mealType);
    setAddDialogOpen(true);
  };

  const handleSaveWeight = async () => {
    try {
      await createWeightEntry.mutateAsync({
        entry_date: selectedDate,
        weight_kg: Number(weightKg),
        note: weightNote,
      });
      toast({
        title: "Weight logged",
        description: `Saved ${weightKg} kg for ${formatIsoDate(selectedDate)}.`,
      });
    } catch (error) {
      toast({
        title: "Could not save weight",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Nutrition Diary</h1>
          <p className="text-muted-foreground">
            Log meals quickly, track your macros, and keep weight entries alongside the diary.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSelectedDate((current) => shiftIsoDate(current, -1))}
          >
            Previous
          </Button>
          <Input
            type="date"
            className="w-[180px]"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => setSelectedDate((current) => shiftIsoDate(current, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {overviewQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading diary...</p>
          </CardContent>
        </Card>
      )}

      {overviewQuery.error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {overviewQuery.error instanceof Error
                ? overviewQuery.error.message
                : "Could not load your nutrition diary."}
            </p>
          </CardContent>
        </Card>
      )}

      {overviewQuery.data && profile && (
        <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
          <div className="space-y-4">
            {overviewQuery.data.meal_sections.map((section) => (
              <Card key={section.meal_type}>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">{section.label}</CardTitle>
                    <CardDescription>
                      {section.entries.length} entr{section.entries.length === 1 ? "y" : "ies"} •{" "}
                      {section.totals.calories.toFixed(0)} kcal
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => handleOpenAddDialog(section.meal_type)}
                    disabled={isReadOnly}
                  >
                    Add food
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.entries.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      No foods logged for {section.label.toLowerCase()} yet.
                    </div>
                  )}

                  {section.entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="flex w-full items-start justify-between rounded-xl border border-border bg-background/80 px-4 py-3 text-left transition hover:bg-accent/40"
                      onClick={() => setEditingEntry(entry)}
                    >
                      <div className="flex gap-3">
                        {entry.image_url ? (
                          <img
                            src={entry.image_url}
                            alt={entry.food_name}
                            className="h-14 w-14 rounded-xl border border-border object-cover"
                          />
                        ) : null}
                        <div className="space-y-1">
                          <p className="font-medium">{entry.food_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {[entry.brand_name, formatQuantityWithUnit(entry.quantity, entry.serving_description)]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            P {entry.protein_grams.toFixed(1)}g • C {entry.carbs_grams.toFixed(1)}g • F{" "}
                            {entry.fat_grams.toFixed(1)}g
                            {entry.total_grams ? ` • ${entry.total_grams.toFixed(0)} g total` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{entry.calories.toFixed(0)} kcal</p>
                        <p className="text-xs text-muted-foreground">Edit</p>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily summary</CardTitle>
                <CardDescription>{formatIsoDate(overviewQuery.data.date)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Calories consumed</p>
                      <p className="text-3xl font-bold">
                        {overviewQuery.data.totals.calories.toFixed(0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="text-xl font-semibold">
                        {overviewQuery.data.remaining.calories.toFixed(0)} kcal
                      </p>
                    </div>
                  </div>
                </div>

                <MacroProgressRow
                  label="Protein"
                  value={overviewQuery.data.totals.protein_grams}
                  target={profile.protein_target_grams}
                />
                <MacroProgressRow
                  label="Carbs"
                  value={overviewQuery.data.totals.carbs_grams}
                  target={profile.carbs_target_grams}
                />
                <MacroProgressRow
                  label="Fat"
                  value={overviewQuery.data.totals.fat_grams}
                  target={profile.fat_target_grams}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weight</CardTitle>
                <CardDescription>
                  Save one entry per day. Posting again updates the same date.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Weight in kg"
                    value={weightKg}
                    onChange={(event) => setWeightKg(event.target.value)}
                  />
                  <Input
                    placeholder="Optional note"
                    value={weightNote}
                    onChange={(event) => setWeightNote(event.target.value)}
                  />
                  <Button
                    onClick={handleSaveWeight}
                    disabled={isReadOnly || createWeightEntry.isPending || !weightKg}
                  >
                    {createWeightEntry.isPending ? "Saving..." : "Save weight"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Recent weigh-ins</p>
                  {overviewQuery.data.recent_weights.length === 0 && (
                    <p className="text-sm text-muted-foreground">No weigh-ins yet.</p>
                  )}
                  {overviewQuery.data.recent_weights.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{formatIsoDate(entry.entry_date)}</span>
                      <span className="font-medium">{entry.weight_kg} kg</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Targets</CardTitle>
                <CardDescription>Current diary targets from your nutrition profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Goal</span>
                  <span className="font-medium capitalize">{profile.goal_type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Calories</span>
                  <span className="font-medium">{profile.daily_calorie_target} kcal</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Protein</span>
                  <span className="font-medium">{profile.protein_target_grams} g</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Carbs</span>
                  <span className="font-medium">{profile.carbs_target_grams} g</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fat</span>
                  <span className="font-medium">{profile.fat_target_grams} g</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AddFoodDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        mealType={activeMealType}
        entryDate={selectedDate}
      />

      <EditEntryDialog
        open={Boolean(editingEntry)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingEntry(null);
          }
        }}
        entry={editingEntry}
      />
    </div>
  );
}
