import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Box } from 'lucide-react';
import type { BillingTool } from '@/types/billing';

interface ToolsGridProps {
  tools: BillingTool[];
  isLoading?: boolean;
  onManageTools?: () => void;
}

export function ToolsGrid({ tools, isLoading = false, onManageTools }: ToolsGridProps) {
  const handleManageTools = () => {
    if (onManageTools) {
      onManageTools();
      return;
    }

    toast({
      title: 'Manage tools',
      description: 'Open Billing to update your tool selections.',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Your Tools & Automations</h3>
          <p className="text-sm text-muted-foreground">
            Tool access is based on your selected entitlements
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tool entitlements...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, index) => {
            const stateLabel = tool.entitled ? 'active' : tool.selected ? 'pending' : 'not selected';
            const stateClass = tool.entitled
              ? 'bg-success text-success-foreground'
              : tool.selected
                ? 'bg-warning text-warning-foreground'
                : 'bg-muted text-muted-foreground';

            return (
              <Card
                key={tool.key}
                className="hover-lift animate-scale-in overflow-hidden group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Box className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <Badge className={stateClass}>
                      {stateLabel}
                    </Badge>
                  </div>

                  <h4 className="font-semibold mb-2 group-hover:text-primary transition-colors">
                    {tool.name}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {tool.description || 'No description available.'}
                  </p>

                  <Button
                    variant="outline"
                    className="w-full transition-all hover:scale-105 active:scale-95"
                    onClick={handleManageTools}
                  >
                    Manage
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
