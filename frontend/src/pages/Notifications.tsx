import { PageHeader } from '@/components/dashboard/PageHeader';
import { ActivityTimeline } from '@/components/ntr/ActivityTimeline';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck } from 'lucide-react';
import { mockActivity } from '@/lib/ntrMockData';
import { useToast } from '@/hooks/use-toast';

export default function Notifications() {
  const { toast } = useToast();

  const handleMarkAllRead = () => {
    toast({
      title: 'All notifications marked as read',
      description: 'Your notification list has been cleared.',
    });
  };

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Notifications"
        description="Stay updated with activity across your InsightPilot workspace."
        icon={Bell}
        action={
          <Button variant="outline" onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        }
      />

      <ActivityTimeline activities={mockActivity} showTrackNames />
    </div>
  );
}
