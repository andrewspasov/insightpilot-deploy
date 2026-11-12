import { useEffect, useState, useSyncExternalStore } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentDialog, settleDialog, subscribe } from "@/lib/dialogs";

// Draws the confirm / prompt / alert requested through src/lib/dialogs.ts in
// the app's own neon dialog style. Mounted once in App.
export default function DialogHost() {
  const request = useSyncExternalStore(subscribe, currentDialog, currentDialog);
  const [text, setText] = useState("");

  useEffect(() => {
    setText(request?.defaultValue ?? "");
  }, [request?.id, request?.defaultValue]);

  if (!request) return null;

  const cancelValue = request.kind === "prompt" ? null : false;
  const confirm = () =>
    settleDialog(request.id, request.kind === "prompt" ? text : true);

  return (
    <AlertDialog
      key={request.id}
      open
      onOpenChange={(open) => {
        if (!open) settleDialog(request.id, cancelValue);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={() => settleDialog(request.id, cancelValue)}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title}</AlertDialogTitle>
            {request.description ? (
              <AlertDialogDescription>{request.description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">{request.title}</AlertDialogDescription>
            )}
          </AlertDialogHeader>

          {request.kind === "prompt" && (
            <div className="grid gap-2">
              {request.inputLabel && <Label htmlFor="dialog-host-input">{request.inputLabel}</Label>}
              <Input
                id="dialog-host-input"
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          )}

          <AlertDialogFooter>
            {request.kind !== "alert" && (
              <AlertDialogCancel type="button" onClick={() => settleDialog(request.id, cancelValue)}>
                {request.cancelLabel}
              </AlertDialogCancel>
            )}
            <Button
              type="submit"
              variant={request.destructive ? "destructive" : "default"}
              disabled={request.kind === "prompt" && !text.trim()}
              autoFocus={request.kind !== "prompt"}
            >
              {request.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
