import { format } from "date-fns";
import { ArrowLeft, CreditCard, ExternalLink, FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingOrder } from "@/hooks/use-entitlements";

const orderStatusLabels: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  paid: "Paid",
  uncollectible: "Uncollectible",
  void: "Void",
};

function formatMoney(cents: number, currency: string): string {
  const normalizedCurrency = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
  }).format(cents / 100);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "MMMM d, yyyy");
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default function BillingOrderDetail() {
  const { orderId } = useParams();
  const { data, isLoading, error } = useBillingOrder(orderId);

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title={data ? `Order ${data.local_number}` : "Order details"}
        description="Review your invoice summary, billing period, and Stripe documents."
        icon={CreditCard}
        action={
          <Button asChild variant="outline">
            <Link to="/dashboard/billing">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to billing
            </Link>
          </Button>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading order...</p>}
      {!isLoading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load this order.
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{data.invoice_number || data.local_number}</CardTitle>
                    <CardDescription>
                      Created {formatDate(data.stripe_created_at)}
                    </CardDescription>
                  </div>
                  <Badge variant={data.status === "paid" ? "default" : "secondary"}>
                    {orderStatusLabels[data.status] ?? data.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-border p-5">
                  <p className="text-sm text-muted-foreground mb-2">Order total</p>
                  <p className="text-4xl font-bold">
                    {formatMoney(
                      data.amount_paid_cents || data.amount_due_cents,
                      data.currency,
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Due {formatMoney(data.amount_due_cents, data.currency)}
                    {data.amount_remaining_cents > 0
                      ? `, remaining ${formatMoney(data.amount_remaining_cents, data.currency)}`
                      : ""}
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Line items</h3>
                  <div className="rounded-xl border border-border divide-y divide-border">
                    {data.line_items.length ? (
                      data.line_items.map((item, index) => (
                        <div
                          key={`${item.description}-${index}`}
                          className="flex items-start justify-between gap-4 p-4"
                        >
                          <div>
                            <p className="font-medium">{item.description || "Invoice item"}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.period_start || item.period_end
                                ? `${formatDate(item.period_start)} to ${formatDate(item.period_end)}`
                                : "No billing period"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              {formatMoney(item.amount_cents, item.currency || data.currency)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Qty {item.quantity}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">
                        No line items stored for this order.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                  <CardDescription>Core billing details for this order</CardDescription>
                </CardHeader>
                <CardContent>
                  <DetailRow label="Order #" value={data.local_number} />
                  <DetailRow label="Invoice number" value={data.invoice_number || "—"} />
                  <DetailRow label="Payment date" value={formatDate(data.paid_at)} />
                  <DetailRow label="Due date" value={formatDate(data.due_date)} />
                  <DetailRow label="Billing reason" value={data.billing_reason || "—"} />
                  <DetailRow
                    label="Billing period"
                    value={`${formatDate(data.period_start)} to ${formatDate(data.period_end)}`}
                  />
                  <DetailRow
                    label="Subscription"
                    value={
                      data.subscription
                        ? `${data.subscription.local_number}${data.subscription.access_pass ? ` • ${data.subscription.access_pass.name}` : ""}`
                        : "—"
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Open the Stripe-hosted invoice or PDF</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.hosted_invoice_url ? (
                    <Button asChild className="w-full">
                      <a href={data.hosted_invoice_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open Stripe invoice
                      </a>
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Stripe invoice
                    </Button>
                  )}
                  {data.invoice_pdf_url ? (
                    <Button asChild className="w-full" variant="outline">
                      <a href={data.invoice_pdf_url} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        Download PDF
                      </a>
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      <FileText className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
