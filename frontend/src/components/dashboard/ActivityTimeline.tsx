import { Card } from '@/components/ui/card';
import { TrendingUp, DollarSign, FileText, Zap, RefreshCw } from 'lucide-react';
import { Activity } from '@/types/dashboard';
import { format } from 'date-fns';

interface ActivityTimelineProps {
  activities: Activity[];
}

const iconMap = {
  TrendingUp,
  DollarSign,
  FileText,
  Zap,
  RefreshCw,
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  return (
    <div className="space-y-4">
      {activities.map((activity, index) => {
        const Icon = activity.iconName ? iconMap[activity.iconName as keyof typeof iconMap] : FileText;
        
        return (
          <Card
            key={activity.id}
            className="p-4 hover-lift transition-all duration-300 hover:shadow-lg animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-sm">{activity.title}</h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(activity.timestamp, 'h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{activity.description}</p>
                <span className="text-xs text-muted-foreground mt-2 block">
                  {format(activity.timestamp, 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
