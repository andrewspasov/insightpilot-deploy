// App-styled replacements for window.confirm / window.prompt / window.alert.
//
//   if (!(await confirmDialog({ title: "Delete this recipe?" }))) return;
//   const name = await promptDialog({ title: "Saved meal name", defaultValue: "Lunch" });
//   await alertDialog({ title: "Couldn't save", description: message });
//
// <DialogHost /> (mounted once in App) draws whichever request is first in the
// queue. This file has no React or app imports so it can be tested on its own.

export type DialogRequest = {
  id: number;
  kind: "confirm" | "prompt" | "alert";
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  inputLabel?: string;
  defaultValue: string;
  resolve: (value: boolean | string | null) => void;
};

type CommonOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type ConfirmOptions = CommonOptions & { destructive?: boolean };
export type PromptOptions = CommonOptions & { inputLabel?: string; defaultValue?: string };

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The dialog that should be on screen now, if any. */
export function currentDialog(): DialogRequest | null {
  return queue[0] ?? null;
}

/** Close the current dialog with a result: true/false for confirm, text or null for prompt. */
export function settleDialog(id: number, value: boolean | string | null) {
  const request = queue.find((item) => item.id === id);
  if (!request) return;
  queue = queue.filter((item) => item.id !== id);
  request.resolve(value);
  emit();
}

function open<T>(request: Omit<DialogRequest, "id" | "resolve">): Promise<T> {
  return new Promise<T>((resolve) => {
    queue = [...queue, { ...request, id: nextId++, resolve: resolve as (value: boolean | string | null) => void }];
    emit();
  });
}

/** Resolves true when the user confirms, false when they cancel or close it. */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === "string" ? { title: options } : options;
  return open<boolean | null>({
    kind: "confirm",
    title: opts.title,
    description: opts.description,
    confirmLabel: opts.confirmLabel ?? "Confirm",
    cancelLabel: opts.cancelLabel ?? "Cancel",
    destructive: opts.destructive ?? false,
    defaultValue: "",
  }).then((value) => value === true);
}

/** Resolves the trimmed text, or null when cancelled or left empty. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return open<string | null>({
    kind: "prompt",
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel ?? "Save",
    cancelLabel: options.cancelLabel ?? "Cancel",
    destructive: false,
    inputLabel: options.inputLabel,
    defaultValue: options.defaultValue ?? "",
  }).then((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  });
}

/** A message with a single OK button. */
export function alertDialog(options: CommonOptions | string): Promise<void> {
  const opts = typeof options === "string" ? { title: options } : options;
  return open<boolean | string | null>({
    kind: "alert",
    title: opts.title,
    description: opts.description,
    confirmLabel: opts.confirmLabel ?? "OK",
    cancelLabel: "",
    destructive: false,
    defaultValue: "",
  }).then(() => undefined);
}
