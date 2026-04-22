import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NtrActivityItem } from '@/types/ntr';
import { mockTracks } from '@/lib/ntrMockData';
import {
  TrendingUp,
  FileText,
  Zap,
  AlertTriangle,
  Activity,
  PlayCircle,
  PauseCircle,
  Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityTimelineProps {
  activities: NtrActivityItem[];
  showTrackNames?: boolean;
}

export function ActivityTimeline({ activities, showTrackNames }: ActivityTimelineProps) {
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

  const getTrackName = (trackId?: string) => {
    if (!trackId || !showTrackNames) return null;
    const track = mockTracks.find((t) => t.id === trackId);
    return track?.name;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const Icon = getIcon(activity.type);
            const trackName = getTrackName(activity.trackId);

            return (
              <div key={activity.id} className="flex gap-3">
                <div className="relative">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted ${getSeverityColor(activity.severity)}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {index < activities.length - 1 && (
                    <div className="absolute left-4 top-8 h-full w-px bg-border" />
                  )}
                </div>
                <div className="flex-1 space-y-1 pt-0.5">
                  <p className="text-sm">{activity.message}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                    </span>
                    {trackName && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <Badge variant="outline" className="text-xs">
                          {trackName}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
