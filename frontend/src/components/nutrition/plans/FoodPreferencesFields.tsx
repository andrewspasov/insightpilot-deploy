import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Choice } from "@/types/plans";

type Props = {
  likeOptions: Choice[];
  avoidOptions: Choice[];
  liked: string[];
  avoided: string[];
  notes: string;
  onChange: (next: { liked?: string[]; avoided?: string[]; notes?: string }) => void;
};

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

/** Liked foods, diet/allergy tags and free-text dislikes; used by the meal suggestions. */
export function FoodPreferencesFields({ likeOptions, avoidOptions, liked, avoided, notes, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Foods you like</Label>
        <div className="flex flex-wrap gap-2">
          {likeOptions.map((o) => (
            <button key={o.key} type="button" onClick={() => onChange({ liked: toggle(liked, o.key) })}
              aria-pressed={liked.includes(o.key)}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors",
                liked.includes(o.key) ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted")}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Diet & allergies</Label>
        <div className="flex flex-wrap gap-2">
          {avoidOptions.map((o) => (
            <button key={o.key} type="button" onClick={() => onChange({ avoided: toggle(avoided, o.key) })}
              aria-pressed={avoided.includes(o.key)}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors",
                avoided.includes(o.key) ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "hover:bg-muted")}>
              {o.key === "vegetarian" || o.key === "vegan" ? o.label : `No ${o.label.toLowerCase()}`}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="food-notes">Anything else you avoid</Label>
        <Textarea id="food-notes" value={notes} placeholder="e.g. mushrooms, tuna" onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
    </div>
  );
}
