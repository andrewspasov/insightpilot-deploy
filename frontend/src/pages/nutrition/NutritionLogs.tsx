import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Copy, Pencil, Trash2 } from "lucide-react";

import { AddFoodDialog } from "@/components/nutrition/AddFoodDialog";
import { CopyFoodDialog, type CopyScope } from "@/components/nutrition/CopyFoodDialog";
import { DiaryCalendar } from "@/components/nutrition/DiaryCalendar";
import { EditEntryDialog } from "@/components/nutrition/EditEntryDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ToastAction } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  useCreateWeightEntry,
  useDeleteNutritionEntry,
  useNutritionOverview,
  useSaveMealFromDiary,
} from "@/hooks/use-nutrition";
import { useToolAccess } from "@/hooks/use-entitlements";
import { useToast } from "@/hooks/use-toast";
import {
  formatIsoDate,
  formatIsoDateLong,
  formatQuantityWithUnit,
  getTodayIsoDate,
  shiftIsoDate,
  percentOfTarget,
} from "@/lib/nutrition";
import type { NutritionEntry, NutritionMealType } from "@/types/nutrition";
import { promptDialog } from "@/lib/dialogs";
import PhotoCredit from "@/components/nutrition/PhotoCredit";

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

function DatePickerButton({
  dateValue,
  label,
  onDateChange,
  variant = "outline",
  className,
}: {
  dateValue: string;
  label: string;
  onDateChange: (dateValue: string) => void;
  variant?: "outline" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = getTodayIsoDate();
  const formattedDate =
    dateValue === today ? `Today · ${formatIsoDateLong(dateValue)}` : formatIsoDateLong(dateValue);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          className={cn("h-auto min-h-10 min-w-0 justify-start px-3 py-2 text-left", className)}
        >
          <CalendarDays className="h-4 w-4" />
          <span className="grid min-w-0 gap-0.5 leading-tight">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="truncate text-sm font-medium">{formattedDate}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <DiaryCalendar
          selected={dateValue}
          onSelect={(date) => {
            onDateChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function SwipeableEntryRow({
  entry,
  isOpen,
  isDeleting,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  entry: NutritionEntry;
  isOpen: boolean;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const startXRef = useRef<number | null>(null);
  const hasSwipedRef = useRef(false);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) < 18 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
      return;
    }

    event.preventDefault();
    onOpenChange(event.deltaX > 0);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startXRef.current = event.clientX;
    hasSwipedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;
    if (deltaX < -36) {
      hasSwipedRef.current = true;
      onOpenChange(true);
    }
    if (deltaX > 36) {
      hasSwipedRef.current = true;
      onOpenChange(false);
    }
  };

  const handlePointerUp = () => {
    startXRef.current = null;
  };

  const handleRowClick = () => {
    if (hasSwipedRef.current) {
      hasSwipedRef.current = false;
      return;
    }
    if (isOpen) {
      onOpenChange(false);
      return;
    }
    onEdit();
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-background/80"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="absolute inset-y-0 right-0 z-0 grid w-40 grid-cols-2 bg-muted">
        <Button
          type="button"
          variant="secondary"
          className="h-full rounded-none"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-full rounded-none"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
          {isDeleting ? "Deleting" : "Delete"}
        </Button>
      </div>

      {/* A div rather than a <button> so the photo credit's links can sit inside. */}
      <div
        role="button"
        tabIndex={0}
        className="relative z-10 flex w-full cursor-pointer items-start justify-between bg-background px-4 py-3 text-left transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ transform: isOpen ? "translateX(-10rem)" : "translateX(0)" }}
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleRowClick();
          }
        }}
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
            <PhotoCredit attribution={entry.image_attribution} className="block text-muted-foreground" />
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">{entry.calories.toFixed(0)} kcal</p>
          <p className="text-xs text-muted-foreground">{isOpen ? "Actions" : "Swipe"}</p>
        </div>
      </div>
    </div>
  );
}

export default function NutritionLogs() {
  const { toast } = useToast();
  const { isReadOnly } = useToolAccess("nutrition");
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate());
  const [copyScope, setCopyScope] = useState<CopyScope | null>(null);
  // Selection mode for copying individual foods.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activeMealType, setActiveMealType] = useState<NutritionMealType>("breakfast");
  const [editingEntry, setEditingEntry] = useState<NutritionEntry | null>(null);
  const [openEntryActionsId, setOpenEntryActionsId] = useState<number | null>(null);
  const [weightKg, setWeightKg] = useState("");
  const [weightNote, setWeightNote] = useState("");

  const overviewQuery = useNutritionOverview(selectedDate);
  const createWeightEntry = useCreateWeightEntry();
  const saveMeal = useSaveMealFromDiary();
  const deleteEntry = useDeleteNutritionEntry();

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
  const today = getTodayIsoDate();

  const goToDate = (date: string) => {
    setSelecting(false);
    setSelectedIds([]);
    setSelectedDate(date);
  };

  const toggleSelected = (entry: NutritionEntry) =>
    setSelectedIds((ids) => (ids.includes(entry.id) ? ids.filter((id) => id !== entry.id) : [...ids, entry.id]));

  const handleCopied = (targetDate: string) => {
    setSelecting(false);
    setSelectedIds([]);
    if (targetDate !== selectedDate) {
      toast({
        title: `Copied to ${formatIsoDate(targetDate)}`,
        action: (
          <ToastAction altText={`Open ${formatIsoDate(targetDate)}`} onClick={() => goToDate(targetDate)}>
            Open
          </ToastAction>
        ),
      });
    }
  };

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

  const handleSaveMeal = async (mealType: NutritionMealType, fallbackName: string) => {
    const name = await promptDialog({
      title: "Save this meal",
      description: "Give it a name so you can add it again from Add food.",
      inputLabel: "Saved meal name",
      defaultValue: fallbackName,
      confirmLabel: "Save meal",
    });
    if (!name) {
      return;
    }

    try {
      await saveMeal.mutateAsync({
        name,
        entry_date: selectedDate,
        meal_type: mealType,
      });
      toast({
        title: "Meal saved",
        description: `${name} is available from Add food.`,
      });
    } catch (error) {
      toast({
        title: "Could not save meal",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEntry = async (entry: NutritionEntry) => {
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast({
        title: "Entry removed",
        description: `${entry.food_name} was deleted from your diary.`,
      });
      setOpenEntryActionsId(null);
    } catch (error) {
      toast({
        title: "Could not delete entry",
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
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => goToDate(shiftIsoDate(selectedDate, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous day</span>
            </Button>
            <DatePickerButton
              label="Diary date"
              dateValue={selectedDate}
              onDateChange={goToDate}
              className="flex-1 sm:flex-none"
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => goToDate(shiftIsoDate(selectedDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next day</span>
            </Button>
            {selectedDate !== today && (
              <Button variant="ghost" onClick={() => goToDate(today)}>
                Today
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => setCopyScope({ kind: "day" })} disabled={isReadOnly}>
            <Copy className="h-4 w-4" />
            Copy day
          </Button>
          <Button
            variant={selecting ? "secondary" : "outline"}
            onClick={() => {
              setSelecting((value) => !value);
              setSelectedIds([]);
            }}
            disabled={isReadOnly}
          >
            <CheckSquare className="h-4 w-4" />
            {selecting ? "Stop selecting" : "Select foods"}
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
                <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <CardTitle className="text-xl">{section.label}</CardTitle>
                    <CardDescription>
                      {section.entries.length} entr{section.entries.length === 1 ? "y" : "ies"} •{" "}
                      {section.totals.calories.toFixed(0)} kcal
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setCopyScope({ kind: "meal", meal: section.meal_type })}
                      disabled={isReadOnly}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSaveMeal(section.meal_type, `${section.label} ${formatIsoDate(selectedDate)}`)}
                      disabled={isReadOnly || saveMeal.isPending || section.entries.length === 0}
                    >
                      {saveMeal.isPending ? "Saving..." : "Save meal"}
                    </Button>
                    <Button
                      onClick={() => handleOpenAddDialog(section.meal_type)}
                      disabled={isReadOnly}
                    >
                      Add food
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.entries.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      No foods logged for {section.label.toLowerCase()} yet.
                    </div>
                  )}

                  {selecting &&
                    section.entries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"
                      >
                        <Checkbox
                          checked={selectedIds.includes(entry.id)}
                          onCheckedChange={() => toggleSelected(entry)}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{entry.food_name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {formatQuantityWithUnit(entry.quantity, entry.serving_description)}
                          </span>
                        </span>
                        <span className="font-semibold">{entry.calories.toFixed(0)} kcal</span>
                      </label>
                    ))}

                  {!selecting && section.entries.map((entry) => (
                    <SwipeableEntryRow
                      key={entry.id}
                      entry={entry}
                      isOpen={openEntryActionsId === entry.id}
                      isDeleting={deleteEntry.isPending}
                      onOpenChange={(open) => setOpenEntryActionsId(open ? entry.id : null)}
                      onEdit={() => {
                        setOpenEntryActionsId(null);
                        setEditingEntry(entry);
                      }}
                      onDelete={() => handleDeleteEntry(entry)}
                    />
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

      {selecting && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <span className="text-sm font-medium">
            {selectedIds.length ? `${selectedIds.length} selected` : "Tick the foods you want to copy"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => goToDate(selectedDate)}>
              Cancel
            </Button>
            <Button disabled={!selectedIds.length} onClick={() => setCopyScope({ kind: "entries", ids: selectedIds })}>
              Copy to…
            </Button>
          </div>
        </div>
      )}

      <CopyFoodDialog
        scope={copyScope}
        onOpenChange={(open) => !open && setCopyScope(null)}
        currentDate={selectedDate}
        onCopied={handleCopied}
      />

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
