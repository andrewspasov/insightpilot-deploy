import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NtrIntegrationSource } from '@/types/ntr';
import { Plug, Settings } from 'lucide-react';

interface IntegrationSourceCardProps {
  source: NtrIntegrationSource;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}

export function IntegrationSourceCard({ source, onConnect, onManage }: IntegrationSourceCardProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'connected':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Error';
      default:
        return 'Not Connected';
    }
  };

  return (
    <Card className="hover-lift">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{source.name}</CardTitle>
          </div>
          <Badge variant={getStatusVariant(source.status)}>
            {getStatusText(source.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{source.description}</p>
      </CardContent>
      <CardFooter>
        {source.status === 'connected' ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => onManage(source.id)}>
            <Settings className="h-3.5 w-3.5 mr-2" />
            Manage
          </Button>
        ) : (
          <Button size="sm" className="w-full" onClick={() => onConnect(source.id)}>
            <Plug className="h-3.5 w-3.5 mr-2" />
            Connect
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
