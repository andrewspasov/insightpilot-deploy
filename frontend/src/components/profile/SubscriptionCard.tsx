import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { CreditCard, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import type { BillingSummary } from '@/types/billing';

interface SubscriptionCardProps {
  summary: BillingSummary | null;
  isLoading?: boolean;
  onManageSubscription?: () => void;
}

const statusColors = {
  active: 'bg-success text-success-foreground',
  pending: 'bg-accent text-accent-foreground',
  on_hold: 'bg-warning text-warning-foreground',
  canceled: 'bg-destructive text-destructive-foreground',
} as const;

const statusLabels = {
  active: 'Active',
  pending: 'Pending',
  on_hold: 'On hold',
  canceled: 'Canceled',
} as const;

export function SubscriptionCard({
  summary,
  isLoading = false,
  onManageSubscription,
}: SubscriptionCardProps) {
  const currentPass = summary?.current_pass;
  const status = summary?.status ?? 'canceled';
  const nextBilling = summary?.next_billing_date
    ? format(new Date(summary.next_billing_date), 'MMM dd, yyyy')
    : '—';
  const selectedToolsCount = summary?.selected_tools_count ?? 0;
  const toolLimit = currentPass?.tool_limit ?? 0;

  const handleManageSubscription = () => {
    if (onManageSubscription) {
      onManageSubscription();
      return;
    }

    toast({
      title: 'Manage Subscription',
      description: 'Open Billing to manage your pass and payment details.',
    });
  };

  return (
    <Card className="hover-lift animate-scale-in overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary to-accent" />

      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Subscription
              <Badge className={statusColors[status]}>
                {statusLabels[status]}
              </Badge>
            </CardTitle>
            <CardDescription>Manage your pass and billing status</CardDescription>
          </div>
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading subscription details...</p>
        ) : (
          <>
            <div className="rounded-lg bg-gradient-to-br from-muted/50 to-muted/30 p-4 border border-border">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold">
                  {currentPass ? `$${(currentPass.monthly_price_cents / 100).toFixed(2)}` : '—'}
                </span>
                <span className="text-muted-foreground">/ month</span>
              </div>
              <p className="text-lg font-semibold mb-2">{currentPass?.name ?? 'No active pass'}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Next billing: {nextBilling}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted/50 p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Selected Tools</p>
                <p className="font-semibold">
                  {selectedToolsCount}/{toolLimit || '—'}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <p className="font-semibold">{statusLabels[status]}</p>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleManageSubscription}
            className="flex-1 transition-all hover:scale-105 active:scale-95"
          >
            Manage subscription
          </Button>
          <Button
            onClick={handleManageSubscription}
            variant="outline"
            className="flex-1 transition-all hover:scale-105 active:scale-95"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Open billing
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
