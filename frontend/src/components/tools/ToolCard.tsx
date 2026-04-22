import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Lock } from 'lucide-react';

interface ToolCardProps {
  name: string;
  description: string;
  category: string;
  isIncluded: boolean;
  isEnabled?: boolean;
  features?: string[];
  onAction?: () => void;
}

export function ToolCard({
  name,
  description,
  category,
  isIncluded,
  isEnabled = false,
  features = [],
  onAction,
}: ToolCardProps) {
  return (
    <Card className="hover-lift transition-all duration-300 hover:shadow-lg group">
      <CardHeader>
        <div className="flex items-start justify-between mb-2">
          <Badge variant={category === 'Automations' ? 'default' : 'secondary'}>
            {category}
          </Badge>
          <Badge variant={isIncluded ? 'default' : 'outline'} className="gap-1">
            {isIncluded ? (
              <>
                <Check className="h-3 w-3" />
                Included
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                Pro Feature
              </>
            )}
          </Badge>
        </div>
        <CardTitle className="text-lg">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {features.length > 0 && (
          <div className="mb-4 space-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          className="w-full"
          variant={isEnabled ? 'outline' : 'default'}
          onClick={onAction}
          disabled={!isIncluded}
        >
          {isEnabled ? 'Configure' : 'Enable'}
        </Button>
      </CardContent>
    </Card>
  );
}
