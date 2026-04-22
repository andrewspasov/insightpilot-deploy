import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Zap, Store, MessageSquare } from 'lucide-react';

interface QuickActionsProps {
  onAddTrack?: () => void;
  onManageTracks?: () => void;
  onOpenTools?: () => void;
  onAskAI?: () => void;
  disableMutations?: boolean;
}

export function QuickActions({
  onAddTrack,
  onManageTracks,
  onOpenTools,
  onAskAI,
  disableMutations = false,
}: QuickActionsProps) {
  const actions = [
    { icon: Plus, label: 'Add New Track', onClick: onAddTrack, disabled: disableMutations },
    { icon: Zap, label: 'Manage Trend Monitors', onClick: onManageTracks, disabled: disableMutations },
    { icon: Store, label: 'Open Tools', onClick: onOpenTools },
    { icon: MessageSquare, label: 'Ask AI Assistant', onClick: onAskAI },
  ];

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto flex-col gap-2 p-4 hover-lift"
            onClick={action.onClick}
            disabled={action.disabled || !action.onClick}
          >
            <action.icon className="h-6 w-6" />
            <span className="text-xs text-center">{action.label}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
