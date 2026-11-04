import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAnalyzeMealPhoto,
  useCreateCustomFood,
  useCreateNutritionEntry,
  useScanNutritionLabel,
} from "@/hooks/use-nutrition";
import { useToast } from "@/hooks/use-toast";
import { formatNutritionNumber, MEAL_LABELS } from "@/lib/nutrition";
import type { DetectedFood, LabelValues, NutritionMealType } from "@/types/nutrition";

export type ScanMode = "meal" | "label";

type Props = {
  mode: ScanMode | null;
  onOpenChange: (open: boolean) => void;
  mealType: NutritionMealType;
  entryDate: string;
  // Called after something was logged.
  onLogged: () => void;
};

const LABEL_FIELDS: { key: keyof LabelValues; label: string }[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein_grams", label: "Protein (g)" },
  { key: "carbs_grams", label: "Carbs (g)" },
  { key: "fat_grams", label: "Fat (g)" },
  { key: "fiber_grams", label: "Fiber (g)" },
  { key: "sugar_grams", label: "Sugar (g)" },
  { key: "sodium_mg", label: "Sodium (mg)" },
];

const NUTRIENTS = ["calories", "protein_grams", "carbs_grams", "fat_grams", "fiber_grams", "sugar_grams", "sodium_mg"] as const;

type MealDraft = DetectedFood & { selected: boolean; perGram: DetectedFood; gramsText: string };

type LabelDraft = {
  name: string;
  brand: string;
  unit: "g" | "ml";
  per100: Record<keyof LabelValues, string>;
  serving: string;
  pack: string;
};

const num = (text: string) => {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const asText = (value: number | null | undefined) => (value ? String(Math.round(value * 10) / 10) : "");

function readImage(file: File): Promise<{ image_base64: string; mime_type: string; url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({ image_base64: dataUrl.split(",")[1] ?? "", mime_type: file.type || "image/jpeg", url: dataUrl });
    };
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

const toMealDraft = (food: DetectedFood): MealDraft => {
  const grams = Math.max(food.estimated_grams, 1);
  const perGram = { ...food };
  for (const key of NUTRIENTS) perGram[key] = food[key] / grams;
  return { ...food, selected: true, perGram, gramsText: String(Math.round(food.estimated_grams)) };
};

/** Meal photo (AI estimate per food) or nutrition label (values per 100 g), then log. */
export function ScanFoodDialog({ mode, onOpenChange, mealType, entryDate, onLogged }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const analyzeMeal = useAnalyzeMealPhoto();
  const scanLabel = useScanNutritionLabel();
  const createEntry = useCreateNutritionEntry();
  const createCustomFood = useCreateCustomFood();
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [foods, setFoods] = useState<MealDraft[]>([]);
  const [label, setLabel] = useState<LabelDraft | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode) return;
    setPreview(null);
    setNotes("");
    setError("");
    setFoods([]);
    setLabel(null);
    setAmount("");
  }, [mode]);

  const analyzing = analyzeMeal.isPending || scanLabel.isPending;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setFoods([]);
    setLabel(null);
    try {
      const image = await readImage(file);
      setPreview(image.url);
      const body = { image_base64: image.image_base64, mime_type: image.mime_type };
      if (mode === "label") {
        const res = await scanLabel.mutateAsync(body);
        if (!res.found) {
          setError(res.notes || "Couldn't read a nutrition table. Try a sharper, closer photo.");
          return;
        }
        setLabel({
          name: res.product_name,
          brand: res.brand_name,
          unit: res.unit,
          per100: Object.fromEntries(LABEL_FIELDS.map((f) => [f.key, asText(res.per_100[f.key]) || "0"])) as LabelDraft["per100"],
          serving: asText(res.serving_amount),
          pack: asText(res.package_amount),
        });
        setAmount(asText(res.serving_amount ?? res.package_amount ?? 100));
        setNotes(res.notes);
      } else {
        const res = await analyzeMeal.mutateAsync(body);
        if (res.foods.length === 0) setError(res.notes || "No food detected in the photo.");
        setFoods(res.foods.map(toMealDraft));
        setNotes(res.notes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setGrams = (index: number, text: string) =>
    setFoods((current) =>
      current.map((food, i) => {
        if (i !== index) return food;
        const grams = num(text);
        if (!grams) return { ...food, gramsText: text };
        const next = { ...food, gramsText: text, estimated_grams: grams };
        for (const key of NUTRIENTS) next[key] = Math.round(food.perGram[key] * grams * 100) / 100;
        return next;
      }),
    );

  const done = (description: string) => {
    toast({ title: "Logged", description });
    onLogged();
    onOpenChange(false);
  };

  const logMeal = async () => {
    const chosen = foods.filter((f) => f.selected);
    setSaving(true);
    try {
      for (const food of chosen) {
        await createEntry.mutateAsync({
          entry_date: entryDate,
          meal_type: mealType,
          food_source: "custom",
          external_food_id: "ai-photo",
          food_name: food.name,
          brand_name: "",
          serving_description: `${Math.round(food.estimated_grams)} g (AI estimate)`,
          measurement_unit: "serving",
          quantity: 1,
          serving_calories: food.calories,
          serving_protein_grams: food.protein_grams,
          serving_carbs_grams: food.carbs_grams,
          serving_fat_grams: food.fat_grams,
          serving_fiber_grams: food.fiber_grams,
          serving_sugar_grams: food.sugar_grams,
          serving_sodium_mg: food.sodium_mg,
        });
      }
      done(`${chosen.length} item${chosen.length === 1 ? "" : "s"} added to ${MEAL_LABELS[mealType].toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log the foods.");
    } finally {
      setSaving(false);
    }
  };

  const eaten = num(amount);

  const logLabel = async () => {
    if (!label) return;
    if (!label.name.trim()) return setError("Give the product a name.");
    if (!eaten) return setError(`Enter how many ${label.unit} you had.`);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("name", label.name.trim());
      form.append("brand_name", label.brand.trim());
      form.append("serving_description", `100 ${label.unit}`);
      form.append("base_amount", "100");
      form.append("base_unit", label.unit);
      form.append("gram_weight", "100");
      LABEL_FIELDS.forEach((f) => form.append(f.key, String(num(label.per100[f.key]))));
      const food = await createCustomFood.mutateAsync(form);
      const unit = food.available_units.find((u) => u.key === label.unit) ?? food.available_units[0];
      const quantity = unit.key === label.unit ? eaten : eaten / (unit.grams_per_unit || 100);
      await createEntry.mutateAsync({
        entry_date: entryDate,
        meal_type: mealType,
        food_source: "custom",
        external_food_id: String(food.id),
        food_name: food.name,
        brand_name: food.brand_name,
        serving_description: unit.label,
        measurement_unit: unit.key,
        quantity,
        grams_per_unit: unit.grams_per_unit,
        serving_calories: unit.calories,
        serving_protein_grams: unit.protein_grams,
        serving_carbs_grams: unit.carbs_grams,
        serving_fat_grams: unit.fat_grams,
        serving_fiber_grams: unit.fiber_grams,
        serving_sugar_grams: unit.sugar_grams,
        serving_sodium_mg: unit.sodium_mg,
      });
      done(`${food.name} added and saved to your foods.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log the product.");
    } finally {
      setSaving(false);
    }
  };

  const chosen = foods.filter((f) => f.selected);
  const mealTotal = (key: (typeof NUTRIENTS)[number]) => chosen.reduce((sum, f) => sum + f[key], 0);
  const labelTotal = (key: keyof LabelValues) => (label ? (num(label.per100[key]) * eaten) / 100 : 0);
  const presets = label
    ? [
        num(label.pack) ? { text: `Whole pack · ${label.pack} ${label.unit}`, value: label.pack } : null,
        num(label.serving) ? { text: `1 serving · ${label.serving} ${label.unit}`, value: label.serving } : null,
        num(label.serving) ? { text: "2 servings", value: asText(num(label.serving) * 2) } : null,
        num(label.pack) ? { text: "Half pack", value: asText(num(label.pack) / 2) } : null,
        { text: `100 ${label.unit}`, value: "100" },
      ].filter((p): p is { text: string; value: string } => !!p)
    : [];

  return (
    <Dialog open={!!mode} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "label" ? "Scan a nutrition label" : "Analyze a meal photo"}</DialogTitle>
          <DialogDescription>
            {mode === "label"
              ? "Upload a photo of the nutrition table (and net weight). The AI reads values per 100 g; check them, then say how much you had."
              : "Upload a photo of your plate. The AI estimates each food and its portion; adjust the grams before logging."}{" "}
            Uses one AI message.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} disabled={analyzing}>
            <Camera className="h-4 w-4" />
            {preview ? "Use another photo" : "Take or upload photo"}
          </Button>
          {analyzing && <span className="text-sm text-muted-foreground">Analyzing…</span>}
        </div>
        {preview && <img src={preview} alt="Uploaded food" className="max-h-48 rounded-xl border border-border object-contain" />}
        {notes && <p className="text-xs italic text-muted-foreground">{notes}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {mode === "meal" && foods.length > 0 && (
          <div className="space-y-2">
            {foods.map((food, i) => (
              <div key={`${food.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                <Checkbox
                  checked={food.selected}
                  onCheckedChange={(checked) =>
                    setFoods((current) => current.map((f, j) => (j === i ? { ...f, selected: !!checked } : f)))
                  }
                  aria-label={`Include ${food.name}`}
                />
                <div className="flex-1">
                  <p className="font-medium">{food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNutritionNumber(food.calories)} kcal • P {formatNutritionNumber(food.protein_grams)}g • C{" "}
                    {formatNutritionNumber(food.carbs_grams)}g • F {formatNutritionNumber(food.fat_grams)}g
                  </p>
                </div>
                <Input
                  className="w-24"
                  type="number"
                  min="1"
                  value={food.gramsText}
                  onChange={(e) => setGrams(i, e.target.value)}
                  aria-label={`${food.name} grams`}
                />
                <span className="text-sm text-muted-foreground">g</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{formatNutritionNumber(mealTotal("calories"))} kcal</span>
                <span className="text-muted-foreground">
                  {" "}
                  • P {formatNutritionNumber(mealTotal("protein_grams"))}g • C {formatNutritionNumber(mealTotal("carbs_grams"))}g • F{" "}
                  {formatNutritionNumber(mealTotal("fat_grams"))}g
                </span>
              </span>
              <Button onClick={logMeal} disabled={saving || chosen.length === 0}>
                {saving ? "Logging…" : `Log ${chosen.length} item${chosen.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {mode === "label" && label && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={label.name} placeholder="Product name" onChange={(e) => setLabel({ ...label, name: e.target.value })} />
              <Input value={label.brand} placeholder="Brand (optional)" onChange={(e) => setLabel({ ...label, brand: e.target.value })} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Per 100 {label.unit} — check against the label</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {LABEL_FIELDS.map((f) => (
                  <label key={f.key} className="space-y-1 text-xs text-muted-foreground">
                    {f.label}
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={label.per100[f.key]}
                      onChange={(e) => setLabel({ ...label, per100: { ...label.per100, [f.key]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                Serving size ({label.unit})
                <Input type="number" min="0" value={label.serving} onChange={(e) => setLabel({ ...label, serving: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Whole pack ({label.unit})
                <Input type="number" min="0" value={label.pack} onChange={(e) => setLabel({ ...label, pack: e.target.value })} />
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">How much did you have?</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button
                    key={p.text}
                    size="sm"
                    variant={num(amount) === num(p.value) ? "default" : "outline"}
                    onClick={() => setAmount(p.value)}
                  >
                    {p.text}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input className="w-32" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="text-sm text-muted-foreground">{label.unit}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{formatNutritionNumber(labelTotal("calories"))} kcal</span>
                <span className="text-muted-foreground">
                  {" "}
                  • P {formatNutritionNumber(labelTotal("protein_grams"))}g • C {formatNutritionNumber(labelTotal("carbs_grams"))}g • F{" "}
                  {formatNutritionNumber(labelTotal("fat_grams"))}g
                </span>
              </span>
              <Button onClick={logLabel} disabled={saving}>
                {saving ? "Logging…" : "Log and save to my foods"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
