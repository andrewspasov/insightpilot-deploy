import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NtrActivityItem } from '@/types/ntr';
import { TrendingUp, FileText, Zap, AlertTriangle, Activity, PlayCircle, PauseCircle, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityFeedProps {
  activities: NtrActivityItem[];
}

const getIcon = (type: NtrActivityItem['type']) => {
  switch (type) {
    case 'new_trend_detected':
      return TrendingUp;
    case 'report_generated':
      return FileText;
    case 'snapshot_created':
      return Activity;
    case 'integration_issue':
      return AlertTriangle;
    case 'track_created':
      return Plus;
    case 'track_paused':
      return PauseCircle;
    case 'track_updated':
      return PlayCircle;
    default:
      return Zap;
  }
};

const getSeverityColor = (severity: NtrActivityItem['severity']) => {
  switch (severity) {
    case 'error':
      return 'text-destructive';
    case 'warning':
      return 'text-warning';
    default:
      return 'text-primary';
  }
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.slice(0, 5).map((activity, index) => {
            const Icon = getIcon(activity.type);
            
            return (
              <div
                key={activity.id}
                className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex-shrink-0">
                  <div className={`p-2 rounded-lg bg-muted ${getSeverityColor(activity.severity)}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm mb-1">{activity.message}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
