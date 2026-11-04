import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNutritionProfile, useUpdateNutritionProfile } from "@/hooks/use-nutrition";
import { usePlanOptions } from "@/hooks/use-plans";

import { FoodPreferencesFields } from "./FoodPreferencesFields";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void };

export function FoodPreferencesDialog({ open, onOpenChange, onSaved }: Props) {
  const options = usePlanOptions();
  const profile = useNutritionProfile();
  const update = useUpdateNutritionProfile();
  const [liked, setLiked] = useState<string[]>([]);
  const [avoided, setAvoided] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !profile.data) return;
    setLiked(profile.data.liked_foods ?? []);
    setAvoided(profile.data.avoided_foods ?? []);
    setNotes(profile.data.food_preferences ?? "");
    setError("");
  }, [open, profile.data]);

  const save = async () => {
    try {
      await update.mutateAsync({ liked_foods: liked, avoided_foods: avoided, food_preferences: notes.trim() });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Food preferences</DialogTitle>
          <DialogDescription>Example meals favour what you like and never include what you avoid.</DialogDescription>
        </DialogHeader>
        {options.data ? (
          <FoodPreferencesFields
            likeOptions={options.data.liked_foods}
            avoidOptions={options.data.avoided_foods}
            liked={liked}
            avoided={avoided}
            notes={notes}
            onChange={(next) => {
              if (next.liked) setLiked(next.liked);
              if (next.avoided) setAvoided(next.avoided);
              if (next.notes !== undefined) setNotes(next.notes);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending || !options.data}>
            {update.isPending ? "Saving…" : "Save and refresh meals"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
