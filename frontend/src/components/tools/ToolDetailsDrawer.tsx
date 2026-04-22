import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Settings } from 'lucide-react';

interface ToolDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tool?: {
    name: string;
    description: string;
    category: string;
    isIncluded: boolean;
    isEnabled?: boolean;
    features: string[];
    detailedDescription?: string;
  };
  onAction?: () => void;
}

export function ToolDetailsDrawer({ isOpen, onClose, tool, onAction }: ToolDetailsDrawerProps) {
  if (!tool) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={tool.category === 'Automations' ? 'default' : 'secondary'}>
              {tool.category}
            </Badge>
            <Badge variant={tool.isIncluded ? 'default' : 'outline'}>
              {tool.isIncluded ? 'Included in Plan' : 'Pro Feature'}
            </Badge>
          </div>
          <SheetTitle className="text-2xl">{tool.name}</SheetTitle>
          <SheetDescription className="text-base">
            {tool.detailedDescription || tool.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold mb-3">Key Features</h3>
            <div className="space-y-3">
              {tool.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="p-1 rounded-full bg-primary/10 mt-0.5">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground flex-1">{feature}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              className="w-full"
              size="lg"
              onClick={onAction}
              disabled={!tool.isIncluded}
            >
              {tool.isEnabled ? (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Settings
                </>
              ) : (
                'Turn On Automation'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
