import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NtrTrendReport, NtrTrack } from '@/types/ntr';
import { ArrowLeft, Calendar, MessageSquare, TrendingUp, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface ReportDetailViewProps {
  report: NtrTrendReport;
  track?: NtrTrack;
  onBack: () => void;
}

export function ReportDetailView({ report, track, onBack }: ReportDetailViewProps) {
  const navigate = useNavigate();
  const metrics = report.metrics;
  const isYouTube = track?.platform === 'youtube';
  const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const handleAskAI = () => {
    navigate('/dashboard/ai-assistant');
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Reports
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl mb-2">{report.title}</CardTitle>
              {track && (
                <Badge variant="secondary" className="mb-3">
                  {track.name}
                </Badge>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(report.periodStart), 'MMM d, yyyy')} -{' '}
                  {format(new Date(report.periodEnd), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>
            <p className="text-muted-foreground leading-relaxed">{report.summary}</p>
          </div>

          {metrics && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Metrics</h3>
              <div className="flex flex-wrap gap-2">
                {isYouTube ? (
                  <>
                    <Badge variant="outline" className="text-xs">
                      Views (sample): {numberFmt.format(metrics.searchVolume)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Videos: {numberFmt.format(metrics.mentionCount)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Avg views/video: {numberFmt.format(metrics.priceIndex)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Engagement: {(metrics.sentimentScore * 100).toFixed(2)}%
                    </Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="text-xs">
                      Listings: {numberFmt.format(metrics.searchVolume)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Sampled listings: {numberFmt.format(metrics.mentionCount)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Avg price: {numberFmt.format(metrics.priceIndex)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Sales density: {(metrics.sentimentScore * 100).toFixed(2)}%
                    </Badge>
                  </>
                )}
              </div>
            </div>
          )}

          {report.highlights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-success" />
                <h3 className="text-lg font-semibold">Highlights</h3>
              </div>
              <ul className="space-y-2">
                {report.highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-success rounded-full mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground">{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.risks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h3 className="text-lg font-semibold">Risks & Concerns</h3>
              </div>
              <ul className="space-y-2">
                {report.risks.map((risk, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 bg-warning rounded-full mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Ask AI about this report</h4>
                <p className="text-sm text-muted-foreground">
                  Get deeper insights and ask questions about this trend report
                </p>
              </div>
            </div>
            <Button onClick={handleAskAI}>Open AI Assistant</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
