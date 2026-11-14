import { Bell } from 'lucide-react';

import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function Notifications() {
  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Notifications"
        description="Stay updated with activity across your InsightPilot workspace."
        icon={Bell}
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No notifications yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Coach check-ins and account updates will show up here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
