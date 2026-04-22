import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CreditCard } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useAccessPasses,
  useChangePass,
  useCreateSubscription,
  useEntitlements,
  useSelectTools,
} from "@/hooks/use-entitlements";

const statusLabels: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  on_hold: "On hold",
  canceled: "Canceled",
};

const orderStatusLabels: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  paid: "Paid",
  uncollectible: "Uncollectible",
  void: "Void",
};

export default function Billing() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useEntitlements();
  const { data: passData, isLoading: isPassesLoading } = useAccessPasses();
  const changePass = useChangePass();
  const createSubscription = useCreateSubscription();
  const selectTools = useSelectTools();

  const [targetPassKey, setTargetPassKey] = useState<string>("");
  const [selectedToolKeys, setSelectedToolKeys] = useState<string[]>([]);

  useEffect(() => {
    if (data?.current_pass?.key) {
      setTargetPassKey(data.current_pass.key);
    } else if (!targetPassKey && passData?.passes?.length) {
      setTargetPassKey(passData.passes[0].key);
    }
    if (data?.selected_tool_keys) {
      setSelectedToolKeys(data.selected_tool_keys);
    }
  }, [data?.current_pass?.key, data?.selected_tool_keys, passData?.passes, targetPassKey]);

  const status = data?.status ?? "canceled";
  const nextBilling = data?.next_billing_date
    ? format(new Date(data.next_billing_date), "MMMM d, yyyy")
    : "—";

  const currentPass = data?.current_pass;
  const scheduledPass = data?.scheduled_pass;
  const availablePasses = passData?.passes ?? [];
  const selectedPass = availablePasses.find((pass) => pass.key === targetPassKey) ?? currentPass ?? null;

  const selectedCount = selectedToolKeys.length;
  const currentLimit = currentPass?.tool_limit ?? 0;
  const canWrite = status === "active" && !data?.is_read_only;
  const canManagePassSelection = status === "active" || status === "canceled";
  const canPurchasePass = status === "canceled";
  const paymentPending = status === "pending";

  const targetIsUpgrade = useMemo(() => {
    if (!currentPass || !selectedPass) return false;
    return selectedPass.monthly_price_cents > currentPass.monthly_price_cents;
  }, [currentPass, selectedPass]);

  const handleToggleTool = (toolKey: string) => {
    if (!canWrite) return;
    setSelectedToolKeys((prev) => {
      const has = prev.includes(toolKey);
      if (has) return prev.filter((key) => key !== toolKey);
      const limit = selectedPass?.tool_limit ?? currentLimit;
      if (limit && prev.length >= limit) {
        toast({
          title: "No slots left",
          description: `This pass allows up to ${limit} tool(s).`,
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, toolKey];
    });
  };

  const handleSaveTools = async () => {
    try {
      await selectTools.mutateAsync({ selected_tool_keys: selectedToolKeys });
      toast({
        title: "Tools updated",
        description: "Your selected tools were saved.",
      });
      refetch();
    } catch (err) {
      toast({
        title: "Could not update tools",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleApplyPass = async () => {
    if (!selectedPass) return;

    if (canPurchasePass) {
      try {
        const result = await createSubscription.mutateAsync({
          target_pass_key: selectedPass.key,
        });
        if (result?.payment_action_required && result?.payment_url) {
          toast({
            title: "Payment required",
            description: "Open Stripe invoice to complete your first purchase.",
          });
          window.open(result.payment_url, "_blank", "noopener,noreferrer");
        } else {
          toast({
            title: "Pass created",
            description: "Your subscription was created.",
          });
        }
        refetch();
      } catch (err) {
        toast({
          title: "Could not start subscription",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
      return;
    }

    if (!currentPass) return;
    if (selectedToolKeys.length === 0) {
      toast({
        title: "Select at least one tool",
        description: "Pick tool(s) before changing the pass.",
        variant: "destructive",
      });
      return;
    }
    try {
      const payload = {
        target_pass_key: selectedPass.key,
        selected_tool_keys: selectedToolKeys,
        effective_mode: (targetIsUpgrade ? "immediate" : "next_cycle") as "immediate" | "next_cycle",
      };
      const result = await changePass.mutateAsync(payload);
      if (result?.payment_action_required && result?.payment_url) {
        toast({
          title: "Payment required",
          description: "Open Stripe invoice to complete the upgrade.",
        });
        window.open(result.payment_url, "_blank", "noopener,noreferrer");
      } else {
        toast({
          title: "Pass updated",
          description: targetIsUpgrade
            ? "Upgrade applied."
            : "Downgrade scheduled for next billing cycle.",
        });
      }
      refetch();
    } catch (err) {
      toast({
        title: "Could not change pass",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your pass and tool access"
        icon={CreditCard}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading billing summary...</p>}
      {!isLoading && error && <p className="text-sm text-destructive">Could not load billing data.</p>}

      {!isLoading && status === "on_hold" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your subscription is in a grace period. Tool workspaces are read-only until payment succeeds.
        </div>
      )}

      {!isLoading && status === "canceled" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          You do not have an active pass. Buy one to unlock tools and the rest of the workspace.
        </div>
      )}

      {!isLoading && paymentPending && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Your subscription is waiting for payment confirmation. Complete the Stripe invoice below to activate tool access.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="animate-scale-in">
          <CardHeader>
            <CardTitle>Current Pass</CardTitle>
            <CardDescription>Subscription status and renewal date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">{currentPass?.name ?? "No pass"}</h3>
                <p className="text-sm text-muted-foreground">
                  {currentPass ? `$${(currentPass.monthly_price_cents / 100).toFixed(2)} / month` : "—"}
                </p>
              </div>
              <Badge variant={status === "active" ? "default" : "secondary"}>
                {statusLabels[status] ?? status}
              </Badge>
            </div>

            <div className="pt-4 border-t space-y-2">
              <p className="text-sm text-muted-foreground">Next billing date</p>
              <p className="font-semibold">{nextBilling}</p>
              <p className="text-sm text-muted-foreground">
                Slot usage: {selectedCount}/{currentLimit || "—"}
              </p>
            </div>

            {scheduledPass && (
              <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                Scheduled change: {scheduledPass.name}
                {data?.scheduled_change_effective_at
                  ? ` on ${format(new Date(data.scheduled_change_effective_at), "MMMM d, yyyy")}`
                  : ""}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-scale-in" style={{ animationDelay: "100ms" }}>
          <CardHeader>
            <CardTitle>{canPurchasePass ? "Choose Your First Pass" : "Change Pass"}</CardTitle>
            <CardDescription>
              {canPurchasePass
                ? "Start with a pass. Payment happens in Stripe, and tools unlock after it succeeds."
                : "Upgrades apply immediately with proration. Downgrades apply next cycle."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPassesLoading ? (
              <p className="text-sm text-muted-foreground">Loading passes...</p>
            ) : (
              <div className="grid gap-2">
                {availablePasses.map((pass) => (
                  <button
                    key={pass.key}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      targetPassKey === pass.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setTargetPassKey(pass.key)}
                    disabled={!canManagePassSelection}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{pass.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ${(pass.monthly_price_cents / 100).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{pass.tool_limit} tool slots</p>
                  </button>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleApplyPass}
              disabled={
                !canManagePassSelection
                || !selectedPass
                || paymentPending
                || changePass.isPending
                || createSubscription.isPending
              }
            >
              {createSubscription.isPending || changePass.isPending
                ? "Applying..."
                : canPurchasePass
                  ? "Purchase selected pass"
                  : paymentPending
                    ? "Waiting for payment"
                    : "Apply pass change"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-in" style={{ animationDelay: "200ms" }}>
        <CardHeader>
          <CardTitle>Selected Tools</CardTitle>
          <CardDescription>
            {canWrite
              ? "Choose tools within your pass slot limit"
              : "Tool selection unlocks after payment succeeds and the pass becomes active."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.tools?.map((tool) => {
            const checked = selectedToolKeys.includes(tool.key);
            return (
              <label
                key={tool.key}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleTool(tool.key)}
                  disabled={!canWrite}
                />
              </label>
            );
          })}

          <Button
            className="w-full"
            variant="secondary"
            onClick={handleSaveTools}
            disabled={!canWrite || selectTools.isPending}
          >
            {selectTools.isPending ? "Saving..." : "Save selected tools"}
          </Button>

          <div className="text-sm text-muted-foreground">
            Customer ID: {data?.stripe_customer_id || "—"}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-in" style={{ animationDelay: "300ms" }}>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>Invoices linked to your subscription</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data?.orders?.length && (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          )}

          {data?.orders?.map((order) => (
            <div
              key={order.stripe_invoice_id}
              className="rounded-lg border border-border px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    <Link
                      to={`/dashboard/billing/orders/${order.id}`}
                      className="hover:underline"
                    >
                      {order.invoice_number || order.local_number || order.stripe_invoice_id}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.stripe_created_at
                      ? format(new Date(order.stripe_created_at), "MMMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                <Badge variant={order.status === "paid" ? "secondary" : "outline"}>
                  {orderStatusLabels[order.status] ?? order.status}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Paid: {(order.amount_paid_cents / 100).toFixed(2)}{" "}
                  {(order.currency || "usd").toUpperCase()}
                </span>
                <div className="flex items-center gap-2">
                  {order.hosted_invoice_url && (
                    <a
                      className="underline"
                      href={order.hosted_invoice_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  )}
                  {order.invoice_pdf_url && (
                    <a
                      className="underline"
                      href={order.invoice_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
