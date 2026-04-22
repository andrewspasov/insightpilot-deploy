import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToolSummary } from '@/types/ntr';
import { Sparkles, Lock, ArrowRight } from 'lucide-react';

interface ToolSummaryCardProps {
  tool: ToolSummary;
  onAction: (slug: string, status: string) => void;
}

export function ToolSummaryCard({ tool, onAction }: ToolSummaryCardProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">In Use</Badge>;
      case 'available':
        return <Badge variant="secondary">Available</Badge>;
      case 'locked':
        return <Badge variant="outline">Locked</Badge>;
      default:
        return null;
    }
  };

  const getActionButton = () => {
    switch (tool.status) {
      case 'active':
        return (
          <Button onClick={() => onAction(tool.slug, tool.status)} className="w-full">
            <ArrowRight className="h-4 w-4 mr-2" />
            Open Tool
          </Button>
        );
      case 'available':
        return (
          <Button onClick={() => onAction(tool.slug, tool.status)} className="w-full">
            <Sparkles className="h-4 w-4 mr-2" />
            Enable Tool
          </Button>
        );
      case 'locked':
        return (
          <Button variant="outline" onClick={() => onAction(tool.slug, tool.status)} className="w-full">
            <Lock className="h-4 w-4 mr-2" />
            Upgrade to Use
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="hover-lift">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">{tool.name}</CardTitle>
              {tool.requiresPlanLevel && (
                <span className="text-xs text-muted-foreground">Requires {tool.requiresPlanLevel}</span>
              )}
            </div>
          </div>
          {getStatusBadge(tool.status)}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      </CardContent>
      <CardFooter>{getActionButton()}</CardFooter>
    </Card>
  );
}
