import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight } from 'lucide-react';

interface AIInsightCardProps {
  onOpenReport?: () => void;
  onAskAI?: () => void;
}

export function AIInsightCard({ onOpenReport, onAskAI }: AIInsightCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Today's AI Insight
          </CardTitle>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            New
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">
            Strong Growth Detected in Standing Desks
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Standing Desks in EU show a 22% increase in interest compared to last week. 
            Consumer focus is shifting toward premium ergonomic features. Consider testing 
            a higher price point or increasing ad spend in this growing market.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={onOpenReport} className="flex-1">
            Open Full Report
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button onClick={onAskAI} variant="outline" className="flex-1">
            <Sparkles className="h-4 w-4 mr-2" />
            Ask AI Assistant
          </Button>
        </div>

        <div className="pt-4 border-t space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Key Signals:</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Search Vol.</p>
              <p className="text-sm font-bold">+22%</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Mentions</p>
              <p className="text-sm font-bold">1,247</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Direction</p>
              <p className="text-sm font-bold">↑ Up</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
