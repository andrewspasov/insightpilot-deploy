import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { FileText, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BillingOrder } from '@/types/billing';

interface BillingHistoryTableProps {
  orders: BillingOrder[];
  isLoading?: boolean;
}

const statusColors = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-warning text-warning-foreground',
  paid: 'bg-success text-success-foreground',
  uncollectible: 'bg-destructive text-destructive-foreground',
  void: 'bg-muted text-muted-foreground',
} as const;

const statusLabels = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  uncollectible: 'Uncollectible',
  void: 'Void',
} as const;

function formatMoney(cents: number, currency: string): string {
  const normalizedCurrency = (currency || 'USD').toUpperCase();
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
  }).format(cents / 100);
}

export function BillingHistoryTable({ orders, isLoading = false }: BillingHistoryTableProps) {
  const openInvoice = (url: string | undefined) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className="animate-scale-in">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>View and download your invoices</CardDescription>
          </div>
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading invoices...</p>
          ) : !orders.length ? (
            <p className="p-4 text-sm text-muted-foreground">No billing history yet.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Invoice
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Invoice
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.map((order, index) => (
                      <tr
                        key={order.stripe_invoice_id || order.invoice_number}
                        className="hover:bg-muted/30 transition-colors animate-fade-in"
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {order.stripe_created_at
                            ? format(new Date(order.stripe_created_at), 'MMM dd, yyyy')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Link
                            to={`/dashboard/billing/orders/${order.id}`}
                            className="font-medium hover:underline"
                          >
                            {order.invoice_number || order.local_number || order.stripe_invoice_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                          {formatMoney(order.amount_paid_cents, order.currency)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <Badge className={statusColors[order.status]}>
                            {statusLabels[order.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openInvoice(order.invoice_pdf_url || order.hosted_invoice_url)}
                            disabled={!order.invoice_pdf_url && !order.hosted_invoice_url}
                            className="transition-all hover:scale-105"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-border">
                {orders.map((order, index) => (
                  <div
                    key={order.stripe_invoice_id || order.invoice_number}
                    className="p-4 hover:bg-muted/30 transition-colors animate-fade-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Link
                          to={`/dashboard/billing/orders/${order.id}`}
                          className="font-medium hover:underline"
                        >
                          {order.invoice_number || order.local_number || order.stripe_invoice_id}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {order.stripe_created_at
                            ? format(new Date(order.stripe_created_at), 'MMM dd, yyyy')
                            : '—'}
                        </p>
                      </div>
                      <Badge className={statusColors[order.status]}>
                        {statusLabels[order.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">
                        {formatMoney(order.amount_paid_cents, order.currency)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInvoice(order.invoice_pdf_url || order.hosted_invoice_url)}
                        disabled={!order.invoice_pdf_url && !order.hosted_invoice_url}
                        className="transition-all hover:scale-105"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Invoice
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
