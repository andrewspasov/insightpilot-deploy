import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadDialogs() {
  const exports = {};
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("../src/lib/dialogs.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  );
  runInNewContext(outputText, { exports, Promise, Set });
  return exports;
}

test("confirm resolves true on confirm and false on cancel", async () => {
  const d = loadDialogs();
  const yes = d.confirmDialog({ title: "Delete?", destructive: true });
  const first = d.currentDialog();
  assert.equal(first.kind, "confirm");
  assert.equal(first.title, "Delete?");
  assert.equal(first.destructive, true);
  d.settleDialog(first.id, true);
  assert.equal(await yes, true);

  const no = d.confirmDialog("Sure?");
  d.settleDialog(d.currentDialog().id, false);
  assert.equal(await no, false);
  assert.equal(d.currentDialog(), null);
});

test("prompt returns trimmed text, or null when cancelled or empty", async () => {
  const d = loadDialogs();
  const named = d.promptDialog({ title: "Saved meal name", defaultValue: "Lunch Thu" });
  assert.equal(d.currentDialog().defaultValue, "Lunch Thu");
  d.settleDialog(d.currentDialog().id, "  My lunch  ");
  assert.equal(await named, "My lunch");

  const cancelled = d.promptDialog({ title: "Name" });
  d.settleDialog(d.currentDialog().id, null);
  assert.equal(await cancelled, null);

  const blank = d.promptDialog({ title: "Name" });
  d.settleDialog(d.currentDialog().id, "   ");
  assert.equal(await blank, null);
});

test("dialogs queue up and show one at a time; listeners hear every change", async () => {
  const d = loadDialogs();
  let changes = 0;
  const unsubscribe = d.subscribe(() => changes++);
  const a = d.alertDialog("First");
  const b = d.confirmDialog("Second");
  assert.equal(d.currentDialog().title, "First");
  d.settleDialog(d.currentDialog().id, true);
  await a;
  assert.equal(d.currentDialog().title, "Second");
  d.settleDialog(d.currentDialog().id, true);
  assert.equal(await b, true);
  assert.equal(changes, 4);
  unsubscribe();
  d.alertDialog("Third");
  assert.equal(changes, 4);
});
