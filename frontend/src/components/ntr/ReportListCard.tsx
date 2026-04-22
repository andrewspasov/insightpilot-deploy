import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NtrTrendReport, NtrTrack } from '@/types/ntr';
import { FileText, Calendar, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface ReportListCardProps {
  report: NtrTrendReport;
  track?: NtrTrack;
  onView: (report: NtrTrendReport) => void;
}

export function ReportListCard({ report, track, onView }: ReportListCardProps) {
  const metrics = report.metrics;
  const isYouTube = track?.platform === 'youtube';
  const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const metricBadges = (() => {
    if (!metrics) return null;
    if (isYouTube) {
      return [
        { label: 'Views (sample)', value: numberFmt.format(metrics.searchVolume) },
        { label: 'Videos', value: numberFmt.format(metrics.mentionCount) },
        { label: 'Avg views/video', value: numberFmt.format(metrics.priceIndex) },
        { label: 'Engagement', value: `${(metrics.sentimentScore * 100).toFixed(2)}%` },
      ];
    }
    return [
      { label: 'Listings', value: numberFmt.format(metrics.searchVolume) },
      { label: 'Sampled listings', value: numberFmt.format(metrics.mentionCount) },
      { label: 'Avg price', value: numberFmt.format(metrics.priceIndex) },
      { label: 'Sales density', value: `${(metrics.sentimentScore * 100).toFixed(2)}%` },
    ];
  })();

  return (
    <Card className="hover-lift cursor-pointer" onClick={() => onView(report)}>
      <CardHeader>
        <div className="flex items-start gap-2 mb-2">
          <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <CardTitle className="text-lg leading-tight">{report.title}</CardTitle>
        </div>
        {track && (
          <Badge variant="secondary" className="w-fit">
            {track.name}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            {format(new Date(report.periodStart), 'MMM d')} -{' '}
            {format(new Date(report.periodEnd), 'MMM d, yyyy')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">{report.summary}</p>
        {metricBadges && (
          <div className="flex flex-wrap gap-2">
            {metricBadges.map((m) => (
              <Badge key={m.label} variant="outline" className="text-xs">
                {m.label}: {m.value}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">
            {report.highlights.length} highlights
          </Badge>
          {report.risks.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {report.risks.length} risks
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" className="w-full" onClick={() => onView(report)}>
          <Eye className="h-3.5 w-3.5 mr-2" />
          View Report
        </Button>
      </CardFooter>
    </Card>
  );
}
