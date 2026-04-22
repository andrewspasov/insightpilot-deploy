import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Settings } from 'lucide-react';
import { Integration } from '@/types/dashboard';
import { format } from 'date-fns';

interface IntegrationCardProps {
  integration: Integration;
  onConnect?: (id: string) => void;
  onManage?: (id: string) => void;
}

export function IntegrationCard({ integration, onConnect, onManage }: IntegrationCardProps) {
  const statusConfig = {
    connected: { icon: CheckCircle2, color: 'text-success', label: 'Connected', variant: 'default' as const },
    disconnected: { icon: XCircle, color: 'text-muted-foreground', label: 'Not Connected', variant: 'secondary' as const },
    error: { icon: AlertCircle, color: 'text-destructive', label: 'Error', variant: 'destructive' as const },
  };

  const status = statusConfig[integration.status];
  const StatusIcon = status.icon;

  return (
    <Card className="hover-lift transition-all duration-300 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-3 rounded-lg bg-primary/10">
              <div className="h-6 w-6 rounded bg-primary/20" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{integration.name}</CardTitle>
              <CardDescription className="mt-1">{integration.description}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${status.color}`} />
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          {integration.status === 'connected' && (
            <>
              {integration.connectedAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Connected:</span>
                  <span>{format(integration.connectedAt, 'MMM d, yyyy')}</span>
                </div>
              )}
              {integration.lastSync && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last sync:</span>
                  <span>{format(integration.lastSync, 'h:mm a')}</span>
                </div>
              )}
            </>
          )}

          {integration.status === 'connected' ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onManage?.(integration.id)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Manage
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={() => onConnect?.(integration.id)}
            >
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
