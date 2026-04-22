import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Eye, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Report } from '@/types/dashboard';
import { format } from 'date-fns';

interface ReportCardProps {
  report: Report;
  onView?: (id: string) => void;
  onDownload?: (id: string) => void;
}

export function ReportCard({ report, onView, onDownload }: ReportCardProps) {
  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="hover-lift transition-all duration-300 hover:shadow-lg">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg mb-1 truncate">{report.title}</CardTitle>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">{report.product}</Badge>
              <Badge variant="outline">{report.marketplace}</Badge>
              <span className="text-xs text-muted-foreground">
                {format(report.generatedAt, 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{report.summary}</p>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          {report.keyStats.map((stat, index) => (
            <div key={index} className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                {getTrendIcon(stat.trend)}
              </div>
              <span className="text-lg font-bold">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onView?.(report.id)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload?.(report.id)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
