import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useExerciseLibrary } from "@/hooks/use-plans";
import { titleCase } from "@/lib/plan-format";
import { cn } from "@/lib/utils";
import type { LibraryExercise } from "@/types/plans";

import { ExerciseImage } from "./ExerciseImage";

const MUSCLES = [
  "chest", "shoulders", "triceps", "biceps", "lats", "middle back", "traps",
  "quadriceps", "hamstrings", "glutes", "calves", "abdominals", "forearms",
];

type Props = {
  open: boolean;
  title?: string;
  initialMuscle?: string;
  onPick: (exercise: LibraryExercise) => void;
  onOpenChange: (open: boolean) => void;
};

export function ExercisePickerDialog({ open, title = "Choose exercise", initialMuscle = "", onPick, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [muscle, setMuscle] = useState(initialMuscle);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebounced("");
      setMuscle(initialMuscle);
    }
  }, [open, initialMuscle]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const library = useExerciseLibrary(debounced, muscle, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search exercises…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {["", ...MUSCLES].map((m) => (
            <button key={m || "all"} type="button" onClick={() => setMuscle(muscle === m ? "" : m)}>
              <Badge variant={muscle === m ? "default" : "outline"}>{m ? titleCase(m) : "All"}</Badge>
            </button>
          ))}
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {library.isLoading && <p className="text-sm text-muted-foreground">Loading exercises…</p>}
          {library.data?.results.length === 0 && <p className="text-sm text-muted-foreground">No exercises match.</p>}
          {library.data?.results.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted",
              )}
            >
              <ExerciseImage imageUrls={exercise.image_urls} alt={exercise.name} className="h-14 w-14 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{exercise.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[exercise.primary_muscles.map(titleCase).join(", "), exercise.equipment].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
