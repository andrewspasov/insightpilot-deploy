// frontend/src/pages/ntr/NtrReports.tsx

import { useEffect, useState } from "react";

// Header component (title + description + icon)
import { PageHeader } from "@/components/dashboard/PageHeader";

// Existing NTR report UI components
import { ReportListCard } from "@/components/ntr/ReportListCard";
import { ReportDetailView } from "@/components/ntr/ReportDetailView";

// Icon for page header
import { FileText } from "lucide-react";

// API helper (handles JWT header)
import { apiGet } from "@/lib/api";

// Types for tracks and reports
import { NtrPlatform, NtrTrack, NtrTrendReport } from "@/types/ntr";

const normalizePlatform = (platform: string | undefined): NtrPlatform =>
  platform === "mercadolibre" || platform === "etsy" || platform === "shopify"
    ? "mercadolibre"
    : "youtube";

type TrackApi = {
  id: number | string;
  name: string;
  keywords?: string[];
  market_region: string;
  category?: string;
  status?: NtrTrack["status"] | string;
  frequency?: NtrTrack["frequency"] | string;
  platform?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
};

type SnapshotApi = {
  id: number | string;
  track?: number | string;
  track_id?: number | string;
  run_at?: string;
  created_at?: string;
  platform?: string;
  source?: string;
  summary?: string;
  metrics?: Record<string, unknown>;
};

export default function NtrReports() {
  // All real tracks from backend
  const [tracks, setTracks] = useState<NtrTrack[]>([]);

  // All reports we show (built from snapshots)
  const [reports, setReports] = useState<NtrTrendReport[]>([]);

  // Loading + error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which report is currently opened in detail view
  const [selectedReport, setSelectedReport] = useState<NtrTrendReport | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Load tracks from /api/ntr/tracks/
        const tracksApi = await apiGet<TrackApi[]>("/ntr/tracks/");

        const normalizedTracks: NtrTrack[] = tracksApi.map((t) => ({
          id: String(t.id),
          name: t.name,
          keywords: t.keywords ?? [],
          marketRegion: t.market_region,
          category: t.category ?? "",
          status: t.status,
          frequency: t.frequency,
          lastRunAt: t.last_run_at ?? undefined,
          nextRunAt: t.next_run_at ?? undefined,
          // IMPORTANT: your NtrTrack requires platform
          // Backend should send `platform`, but we default to "youtube" just in case
          platform: normalizePlatform(typeof t.platform === "string" ? t.platform : undefined),
        }));

        setTracks(normalizedTracks);

        // 2) Load snapshots from /api/ntr/snapshots/
        const snapshotsApi = await apiGet<SnapshotApi[]>("/ntr/snapshots/");

        const pickNumber = (
          obj: Record<string, unknown>,
          keys: string[],
          fallback = 0,
        ): number => {
          for (const key of keys) {
            const value = obj[key];
            if (typeof value === "number" && Number.isFinite(value)) return value;
          }
          return fallback;
        };

        // 3) Build NtrTrendReport objects from snapshots + tracks
        const builtReports: NtrTrendReport[] = snapshotsApi.map((snap) => {
          // Track id might come as `track` or `track_id` depending on serializer
          const trackId = String(snap.track ?? snap.track_id ?? "");

          const track = normalizedTracks.find((t) => t.id === trackId);
          const isYouTube = track?.platform === "youtube";

          // Most of the numeric data is usually inside a `metrics` JSON field
          const metrics = snap.metrics ?? {};

          const searchVolume = isYouTube
            ? pickNumber(metrics, ["total_views"], 0)
            : pickNumber(metrics, ["search_volume", "searchVolume", "total_results"], 0);
          const mentionCount = isYouTube
            ? pickNumber(metrics, ["video_count"], 0)
            : pickNumber(metrics, ["mention_count", "mentionCount", "sampled_count"], 0);
          const priceIndex = isYouTube
            ? pickNumber(metrics, ["avg_views"], 0)
            : pickNumber(metrics, ["price_index", "priceIndex", "avgPrice", "avg_price"], 0);
          const sentimentScore = isYouTube
            ? pickNumber(metrics, ["engagement_rate"], 0)
            : pickNumber(metrics, ["sentiment_score", "sentimentScore"], 0);

          // Use run_at or created_at as the period for now
          const periodStart = snap.run_at ?? snap.created_at ?? "";
          const periodEnd = snap.run_at ?? snap.created_at ?? "";
          const platformLabel =
            snap.platform === "youtube"
              ? "YouTube"
              : snap.platform === "mercadolibre"
                ? "MercadoLibre"
                : snap.platform ?? "NTR";

          return {
            id: String(snap.id),
            trackId,
            title: track
              ? `Trend report for ${track.name}`
              : `Trend report for track #${trackId}`,
            summary:
              `Latest snapshot from ${platformLabel}${
                snap.source ? ` (${snap.source})` : ""
              }.`,
            periodStart,
            periodEnd,
            metrics: {
              searchVolume,
              mentionCount,
              priceIndex,
              sentimentScore,
            },
            // Your NtrTrendReport type requires these:
            highlights: [],
            risks: [],
          };
        });

        setReports(builtReports);
      } catch (err: unknown) {
        console.error("Error loading NTR reports", err);
        setError(err instanceof Error ? err.message : "Could not load trend reports. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // When user clicks "View report" on a card
  const handleViewReport = (report: NtrTrendReport) => {
    setSelectedReport(report);
  };

  // When user clicks "Back" in the detail view
  const handleBackToList = () => {
    setSelectedReport(null);
  };

  // ---------- DETAIL VIEW BRANCH ----------

  if (selectedReport) {
    const trackForReport = tracks.find((t) => t.id === selectedReport.trackId);

    return (
      <div className="space-y-6 animate-in">
        <ReportDetailView
          report={selectedReport}
          track={trackForReport}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  // ---------- LIST VIEW ----------

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Trend Reports"
        description="View and analyze your market intelligence reports"
        icon={FileText}
      />

      {loading && (
        <p className="text-sm text-muted-foreground">Loading your reports...</p>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report, index) => {
            const trackForReport = tracks.find(
              (t) => t.id === report.trackId,
            );

            return (
              <div
                key={report.id}
                className="animate-scale-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <ReportListCard
                  report={report}
                  track={trackForReport}
                  onView={handleViewReport}
                />
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No reports generated yet. Run one of your tracks to create the first snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
