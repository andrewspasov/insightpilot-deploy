import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Settings, Clock, CheckCircle2, AlertCircle, PauseCircle } from 'lucide-react';
import { Automation } from '@/types/dashboard';
import { format } from 'date-fns';

interface AutomationCardProps {
  automation: Automation;
  onToggle?: (id: string, enabled: boolean) => void;
  onEdit?: (id: string) => void;
}

export function AutomationCard({ automation, onToggle, onEdit }: AutomationCardProps) {
  const statusConfig = {
    active: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Active' },
    paused: { icon: PauseCircle, color: 'text-warning', bg: 'bg-warning/10', label: 'Paused' },
    error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Error' },
  };

  const status = statusConfig[automation.status];
  const StatusIcon = status.icon;

  return (
    <Card className="hover-lift transition-all duration-300 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`p-2 rounded-lg ${status.bg}`}>
              <StatusIcon className={`h-5 w-5 ${status.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{automation.name}</CardTitle>
              <CardDescription className="mt-1">{automation.description}</CardDescription>
            </div>
          </div>
          <Switch
            checked={automation.status === 'active'}
            onCheckedChange={(checked) => onToggle?.(automation.id, checked)}
            className="flex-shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Schedule:</span>
            <span className="font-medium">{automation.schedule}</span>
          </div>

          {automation.lastRun && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last run:</span>
              <span>{format(automation.lastRun, 'MMM d, h:mm a')}</span>
            </div>
          )}

          {automation.nextRun && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Next run:</span>
              <span className="font-medium">{format(automation.nextRun, 'MMM d, h:mm a')}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => onEdit?.(automation.id)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Edit Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
