// frontend/src/pages/ntr/NtrHistory.tsx

import { useCallback, useEffect, useMemo, useState } from "react";

// Reusable page header for the top of the page
import { PageHeader } from "@/components/dashboard/PageHeader";
// Simple card container
import { Card } from "@/components/ui/card";
// Button (used for reload)
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// Types for tracks and snapshots
import { NtrPlatform, NtrTrack, NtrTrendSnapshot } from "@/types/ntr";

// Icons
import { History, RefreshCw } from "lucide-react";

// API helper that already attaches the JWT token
import { apiGet } from "@/lib/api";
import { mockSnapshots } from "@/lib/ntrMockData";

// For pretty date formatting
import { format } from "date-fns";

// Recharts imports for our line chart
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { TooltipProps } from "recharts";

// Shapes returned by the API so we don't fall back to `any`
type TrackApi = {
  id: number | string;
  name: string;
  keywords?: string[];
  market_region: string;
  category?: string;
  status?: NtrTrack["status"] | string;
  frequency?: NtrTrack["frequency"] | string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  platform?: NtrTrack["platform"] | string;
};

type SnapshotMetricsApi = {
  search_volume?: number;
  mention_count?: number;
  price_index?: number;
  sentiment_score?: number;
  // YouTube + compat keys that may show up in metrics JSON
  searchVolume?: number;
  productCount?: number;
  avgPrice?: number;
  sentimentScore?: number;
  total_views?: number;
  video_count?: number;
  avg_views?: number;
  engagement_rate?: number;
  avg_views_per_day?: number;
  ideal_score?: number;
  [key: string]: unknown;
};

type SnapshotApi = {
  id: number | string;
  track: number | string;
  run_at?: string;
  platform?: string;
  source?: string;
  metrics?: SnapshotMetricsApi;
  search_volume?: number;
  mention_count?: number;
  price_index?: number;
  sentiment_score?: number;
  summary?: string;
  created_at?: string;
  updated_at?: string;
};

const normalizePlatform = (platform: string | undefined): NtrPlatform =>
  platform === "mercadolibre" || platform === "etsy" || platform === "shopify"
    ? "mercadolibre"
    : "youtube";

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const formatCompactNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs > 0 && abs < 1) return value.toFixed(2);
  if (abs >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  const normalized = value > 1 ? value / 100 : value;
  return `${(normalized * 100).toFixed(2)}%`;
};

const formatDateTime = (value: number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "MMM d, yyyy HH:mm");
};

const getPaddedDomain = (
  values: number[],
  padRatio = 0.06,
  minPad = 1,
): [number, number] => {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0);
  const pad = Math.max(range * padRatio, Math.abs(max) * padRatio, minPad);
  const lower = min >= 0 ? Math.max(0, min - pad) : min - pad;
  return [lower, max + pad];
};

type ChartPoint = {
  timestamp: number;
  views: number;
  videos: number;
  avgViews: number;
  engagement: number;
  change?: number;
};

type ChartTooltipProps = TooltipProps<number, string> & {
  viewsLabel: string;
  videosLabel: string;
  avgLabel: string;
  engagementLabel: string;
  showChange: boolean;
};

const ChartTooltip = ({
  active,
  payload,
  viewsLabel,
  videosLabel,
  avgLabel,
  engagementLabel,
  showChange,
}: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/90 px-4 py-3 text-xs text-slate-100 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
        {formatDateTime(point.timestamp)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-slate-400">{viewsLabel}</div>
          <div className="text-sm font-semibold text-cyan-200">
            {formatCompactNumber(point.views)}
          </div>
        </div>
        <div>
          <div className="text-slate-400">{videosLabel}</div>
          <div className="text-sm font-semibold text-emerald-200">
            {formatCompactNumber(point.videos)}
          </div>
        </div>
        <div>
          <div className="text-slate-400">{avgLabel}</div>
          <div className="text-sm font-semibold text-slate-200">
            {formatCompactNumber(point.avgViews)}
          </div>
        </div>
        <div>
          <div className="text-slate-400">{engagementLabel}</div>
          <div className="text-sm font-semibold text-slate-200">
            {formatPercent(point.engagement)}
          </div>
        </div>
      </div>
      {showChange && typeof point.change === "number" && point.change !== 0 && (
        <div className="mt-2 text-[11px] text-amber-200">
          Change: {point.change.toFixed(2)}%
        </div>
      )}
    </div>
  );
};

export default function NtrHistory() {
  // -------- 1) TRACK STATE --------

  // All tracks that belong to the logged in user
  const [tracks, setTracks] = useState<NtrTrack[]>([]);

  // Currently selected track id (string)
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");

  // Loading / error state for tracks
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);

  // -------- 2) SNAPSHOT STATE --------

  // All snapshots for the selected track
  const [snapshots, setSnapshots] = useState<NtrTrendSnapshot[]>([]);

  // Loading / error state for snapshots
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "all">(
    "30d",
  );
  const [compareMode, setCompareMode] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState({
    views: false,
    videos: false,
    change: false,
  });
  const [useMockData, setUseMockData] = useState(false);

  // -------- 3) LOAD TRACKS ON MOUNT --------

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        setLoadingTracks(true);
        setTracksError(null);

        // GET /api/ntr/tracks/
        const data = await apiGet<TrackApi[]>("/ntr/tracks/");

        // Map raw backend shape -> NtrTrack
        const normalized: NtrTrack[] = data.map((raw) => {
          const status: NtrTrack["status"] =
            raw.status === "paused" ? "paused" : "active";
          const frequency: NtrTrack["frequency"] =
            raw.frequency === "weekly" ? "weekly" : "daily";
          const platform = normalizePlatform(
            typeof raw.platform === "string" ? raw.platform : undefined,
          );

          return {
            id: String(raw.id),
            name: raw.name,
            keywords: raw.keywords ?? [],
            marketRegion: raw.market_region,
            category: raw.category ?? "",
            status,
            frequency,
            lastRunAt: raw.last_run_at ?? undefined,
            nextRunAt: raw.next_run_at ?? undefined,
            platform, // we already have this on the track model
          };
        });

        setTracks(normalized);

        // Pre-select first track if any
        if (normalized.length > 0) {
          setSelectedTrackId(normalized[0].id);
        }
      } catch (err: unknown) {
        console.error("Error loading NTR tracks for history", err);
        const message =
          err instanceof Error
            ? err.message
            : "Could not load your tracks. Please try again.";
        setTracksError(message);
      } finally {
        setLoadingTracks(false);
      }
    };

    fetchTracks();
  }, []);

  // -------- 4) LOAD SNAPSHOTS WHEN TRACK CHANGES --------

  const fetchSnapshots = useCallback(async (trackId: string) => {
    if (!trackId) return;

    try {
      setLoadingSnapshots(true);
      setSnapshotsError(null);

      // GET /api/ntr/snapshots/?track=<id>
      const data = await apiGet<SnapshotApi[]>(
        `/ntr/snapshots/?track=${trackId}`,
      );

      // Map raw -> NtrTrendSnapshot
      const normalized: NtrTrendSnapshot[] = data.map((raw) => {
        // Try to read metrics from `metrics` object, or fall back to flat fields, or 0
        const metrics = raw.metrics ?? {};

        const searchVolume = toNumber(
          metrics.search_volume ??
            metrics.searchVolume ??
            metrics.total_results ??
            metrics.total_views ??
            raw.search_volume,
        );
        const mentionCount = toNumber(
          metrics.mention_count ??
            metrics.mentionCount ??
            metrics.sampled_count ??
            metrics.video_count ??
            raw.mention_count,
        );
        const priceIndex = toNumber(
          metrics.price_index ??
            metrics.priceIndex ??
            metrics.avg_price ??
            metrics.avg_views ??
            raw.price_index,
        );
        const sentimentScore = toNumber(
          metrics.sentiment_score ??
            metrics.sentimentScore ??
            metrics.engagement_rate ??
            raw.sentiment_score,
        );

        const runAt: string =
          raw.run_at ?? raw.created_at ?? new Date().toISOString();
        const createdAt: string =
          raw.created_at ?? runAt ?? new Date().toISOString();
        const updatedAt: string =
          raw.updated_at ??
          raw.created_at ??
          runAt ??
          new Date().toISOString();

        const trackId = String(
          raw.track ?? (raw as { track_id?: number | string }).track_id ?? "",
        );

        return {
          id: String(raw.id),
          trackId,
          runAt,
          platform: raw.platform ?? "unknown",
          source: raw.source ?? "unknown",
          metrics: {
            searchVolume,
            mentionCount,
            priceIndex,
            sentimentScore,
          },
          // These exist on NtrTrendSnapshot, so we fill them in
          summary: raw.summary ?? "",
          createdAt,
          updatedAt,
        };
      });

      // Sort oldest -> newest by runAt so chart is in order
      normalized.sort(
        (a, b) =>
          new Date(a.runAt).getTime() - new Date(b.runAt).getTime(),
      );

      setSnapshots(normalized);
    } catch (err: unknown) {
      console.error("Error loading NTR snapshots", err);
      const message =
        err instanceof Error
          ? err.message
          : "Could not load snapshots. Please try again.";
      setSnapshotsError(message);
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  }, []);

  // When the selected track changes, load its snapshots
  useEffect(() => {
    if (selectedTrackId) {
      fetchSnapshots(selectedTrackId);
    } else {
      setSnapshots([]);
    }
  }, [selectedTrackId, fetchSnapshots]);

  // -------- 5) DERIVED VALUES FOR UI --------

  const selectedTrack =
    tracks.find((t) => t.id === selectedTrackId) || null;

  const isYouTube = selectedTrack?.platform === "youtube";
  const isDev = import.meta.env.DEV;

  const filteredSnapshots = useMemo(() => {
    if (!selectedTrackId) return [];
    return snapshots.filter((snap) => snap.trackId === selectedTrackId);
  }, [snapshots, selectedTrackId]);

  const chartSnapshots = useMemo(() => {
    if (isDev && useMockData) {
      return mockSnapshots.filter((snap) =>
        selectedTrackId ? snap.trackId === selectedTrackId : true,
      );
    }
    return filteredSnapshots;
  }, [isDev, useMockData, selectedTrackId, filteredSnapshots]);

  const rangeOptions = useMemo(
    () => [
      { key: "24h" as const, label: "24h", ms: 24 * 60 * 60 * 1000 },
      { key: "7d" as const, label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
      { key: "30d" as const, label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
      { key: "all" as const, label: "All", ms: null },
    ],
    [],
  );

  const { chartPoints, rangeEmpty, mappingIssue } = useMemo(() => {
    const basePoints = chartSnapshots
      .map((snap) => {
        const timestamp = new Date(snap.runAt).getTime();
        if (!Number.isFinite(timestamp)) return null;
        return {
          timestamp,
          views: toNumber(snap.metrics.searchVolume),
          videos: toNumber(snap.metrics.mentionCount),
          avgViews: toNumber(snap.metrics.priceIndex),
          engagement: toNumber(snap.metrics.sentimentScore),
        };
      })
      .filter(
        (point): point is NonNullable<typeof point> => point !== null,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const selectedRange = rangeOptions.find((r) => r.key === timeRange);
    const rangeStart =
      selectedRange?.ms != null ? Date.now() - selectedRange.ms : null;

    const filteredPoints =
      rangeStart == null
        ? basePoints
        : basePoints.filter((point) => point.timestamp >= rangeStart);

    const withChange = filteredPoints.map((point) => {
      const baseline = filteredPoints[0]?.views ?? 0;
      const change =
        compareMode && baseline > 0
          ? ((point.views - baseline) / baseline) * 100
          : 0;
      return { ...point, change };
    });

    const hasMappingIssue =
      chartSnapshots.length > 0 && basePoints.length === 0;

    return {
      chartPoints: withChange,
      rangeEmpty: basePoints.length > 0 && filteredPoints.length === 0,
      mappingIssue: hasMappingIssue
        ? "Could not parse snapshot timestamps or metrics."
        : null,
    };
  }, [chartSnapshots, compareMode, rangeOptions, timeRange]);

  useEffect(() => {
    if (mappingIssue) {
      console.warn("History chart mapping issue:", mappingIssue, {
        snapshots: chartSnapshots,
      });
    }
  }, [mappingIssue, chartSnapshots]);

  const viewsDomain = useMemo(
    () => getPaddedDomain(chartPoints.map((point) => point.views)),
    [chartPoints],
  );
  const videosDomain = useMemo(
    () => getPaddedDomain(chartPoints.map((point) => point.videos), 0.08, 1),
    [chartPoints],
  );
  const viewsLabel = isYouTube ? "Total views" : "Listings";
  const videosLabel = isYouTube ? "Videos" : "Sampled listings";
  const avgLabel = isYouTube ? "Avg views/video" : "Avg price";
  const engagementLabel = isYouTube ? "Engagement" : "Sales density";
  const hasAnySnapshots =
    Boolean(selectedTrackId) ||
    (isDev && useMockData && chartSnapshots.length > 0);
  const hasEnoughSnapshots = chartSnapshots.length >= 2;

  // -------- 6) RENDER --------

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="History / Results"
        description="Review the trend measurements collected for each of your tracks over time."
        icon={History}
        action={
          selectedTrackId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchSnapshots(selectedTrackId)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload snapshots
            </Button>
          ) : null
        }
      />

      {/* Track selector card */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Select a track</p>
            <p className="text-xs text-muted-foreground">
              We will show the snapshots collected for the chosen track.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <select
              className="w-full md:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              disabled={loadingTracks || tracks.length === 0}
            >
              {tracks.length === 0 && (
                <option value="">
                  {loadingTracks
                    ? "Loading tracks..."
                    : "No tracks available"}
                </option>
              )}
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>

            {selectedTrack && (
              <span className="text-xs text-muted-foreground text-right md:text-left">
                Status:{" "}
                <strong className="capitalize">
                  {selectedTrack.status}
                </strong>{" "}
                • Platform:{" "}
                <strong className="capitalize">
                  {selectedTrack.platform === "youtube" ? "YouTube" : selectedTrack.platform}
                </strong>
              </span>
            )}
          </div>
        </div>

        {tracksError && (
          <p className="text-sm text-destructive mt-2">{tracksError}</p>
        )}
      </Card>

      {/* Main content: either chart + list, or empty state */}
      {hasAnySnapshots ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          {/* LEFT: chart */}
          <Card className="relative overflow-hidden border border-white/10 bg-slate-950/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_50px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -top-24 right-8 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  History Lens
                </p>
                <h2 className="text-base font-semibold text-slate-100">
                  {viewsLabel} + {videosLabel} over time
                </h2>
                <p className="text-xs text-slate-400">
                  Snapshot cadence visualization with dual-axis focus.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                  {rangeOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setTimeRange(option.key)}
                      className={`rounded-full px-3 py-1 transition ${
                        timeRange === option.key
                          ? "bg-cyan-400/20 text-cyan-100 shadow-[0_0_12px_rgba(56,189,248,0.35)]"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="text-slate-400">Compare mode</span>
                  <Switch
                    checked={compareMode}
                    onCheckedChange={(checked) => setCompareMode(checked)}
                  />
                </div>
                {isDev && (
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <span className="text-slate-400">Mock data</span>
                    <Switch
                      checked={useMockData}
                      onCheckedChange={(checked) => setUseMockData(checked)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              {[
                {
                  key: "views",
                  label: viewsLabel,
                  color: "bg-cyan-400",
                },
                {
                  key: "videos",
                  label: videosLabel,
                  color: "bg-emerald-400",
                },
                ...(compareMode
                  ? [
                      {
                        key: "change",
                        label: "Views change %",
                        color: "bg-amber-400",
                      },
                    ]
                  : []),
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    setHiddenSeries((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key as keyof typeof prev],
                    }))
                  }
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 transition ${
                    hiddenSeries[item.key as keyof typeof hiddenSeries]
                      ? "border-white/10 text-slate-500"
                      : "border-white/20 text-slate-200"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${item.color} ${
                      hiddenSeries[item.key as keyof typeof hiddenSeries]
                        ? "opacity-30"
                        : "opacity-90"
                    }`}
                  />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4 h-72">
              {loadingSnapshots ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-slate-500">
                  <div className="h-2 w-40 rounded-full bg-white/10" />
                  <div className="h-2 w-56 rounded-full bg-white/10" />
                  <div className="h-2 w-32 rounded-full bg-white/10" />
                  <span>Loading history curve...</span>
                </div>
              ) : mappingIssue ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
                  <p className="text-sm font-semibold text-slate-200">
                    We could not read the snapshot data.
                  </p>
                  <p>Open the console for details or rerun the track.</p>
                </div>
              ) : !hasEnoughSnapshots ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
                  <p className="text-sm font-semibold text-slate-200">
                    Run this track again to build history
                  </p>
                  <p>
                    We need at least two snapshots to show trends over time.
                  </p>
                </div>
              ) : rangeEmpty || chartPoints.length < 2 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
                  <p className="text-sm font-semibold text-slate-200">
                    No snapshots in this time range
                  </p>
                  <p>Try a wider range or run the track again.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartPoints}
                    margin={{ top: 10, right: 24, left: 8, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient id="viewsGlow" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.9} />
                      </linearGradient>
                      <linearGradient
                        id="videosGlow"
                        x1="0"
                        x2="1"
                        y1="0"
                        y2="0"
                      >
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.15)"
                      strokeDasharray="2 6"
                    />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value) =>
                        format(new Date(value), "MMM d")
                      }
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                      tickLine={{ stroke: "rgba(148,163,184,0.2)" }}
                    />
                    <YAxis
                      yAxisId="views"
                      domain={viewsDomain}
                      tickFormatter={formatCompactNumber}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                      tickLine={{ stroke: "rgba(148,163,184,0.2)" }}
                    />
                    <YAxis
                      yAxisId="videos"
                      orientation="right"
                      domain={videosDomain}
                      tickFormatter={formatCompactNumber}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                      tickLine={{ stroke: "rgba(148,163,184,0.2)" }}
                    />
                    <YAxis yAxisId="percent" hide domain={[-100, 100]} />
                    <Tooltip
                      cursor={{
                        stroke: "rgba(148,163,184,0.35)",
                        strokeDasharray: "4 4",
                      }}
                      content={
                        <ChartTooltip
                          viewsLabel={viewsLabel}
                          videosLabel={videosLabel}
                          avgLabel={avgLabel}
                          engagementLabel={engagementLabel}
                          showChange={compareMode}
                        />
                      }
                    />
                    <Line
                      yAxisId="views"
                      type="monotone"
                      dataKey="views"
                      name={viewsLabel}
                      stroke="url(#viewsGlow)"
                      strokeWidth={2.5}
                      dot={false}
                      hide={hiddenSeries.views}
                      isAnimationActive
                      animationDuration={200}
                    />
                    <Line
                      yAxisId="videos"
                      type="monotone"
                      dataKey="videos"
                      name={videosLabel}
                      stroke="url(#videosGlow)"
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenSeries.videos}
                      isAnimationActive
                      animationDuration={200}
                    />
                    {compareMode && (
                      <Line
                        yAxisId="percent"
                        type="monotone"
                        dataKey="change"
                        name={isYouTube ? "Views change %" : "Listings change %"}
                        stroke="#fbbf24"
                        strokeWidth={1.6}
                        strokeDasharray="6 6"
                        dot={false}
                        hide={hiddenSeries.change}
                        isAnimationActive
                        animationDuration={200}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* RIGHT: snapshot list */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">
              Snapshot runs ({snapshots.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Latest run at the top. These are the raw measurements the
              reports and AI assistant will use.
            </p>

            <div className="space-y-3 max-h-[400px] overflow-auto">
              {loadingSnapshots && (
                <p className="text-xs text-slate-400">
                  Loading snapshot runs...
                </p>
              )}
              {!loadingSnapshots && snapshots.length === 0 && (
                <p className="text-xs text-slate-400">
                  No snapshots yet. Run this track again to build history.
                </p>
              )}
              {snapshots
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.runAt).getTime() -
                    new Date(a.runAt).getTime(),
                )
                .map((snap) => (
                  <div
                    key={snap.id}
                    className="border border-border rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">
                        {format(
                          new Date(snap.runAt),
                          "MMM d, yyyy HH:mm",
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {snap.platform === "youtube"
                          ? "YouTube"
                          : snap.platform === "mercadolibre"
                            ? "MercadoLibre"
                            : snap.platform}{" "}
                        • {snap.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span>
                        {isYouTube ? "Views:" : "Listings:"}{" "}
                        <strong>
                          {formatCompactNumber(snap.metrics.searchVolume)}
                        </strong>
                      </span>
                      <span>
                        {isYouTube ? "Videos:" : "Sampled:"}{" "}
                        <strong>
                          {formatCompactNumber(snap.metrics.mentionCount)}
                        </strong>
                      </span>
                      <span>
                        {isYouTube ? "Avg views/video:" : "Avg price:"}{" "}
                        <strong>
                          {formatCompactNumber(snap.metrics.priceIndex)}
                        </strong>
                      </span>
                      <span>
                        {isYouTube ? "Engagement:" : "Sales density:"}{" "}
                        <strong>
                          {formatPercent(snap.metrics.sentimentScore)}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
            {snapshotsError && (
              <p className="text-xs text-destructive">{snapshotsError}</p>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-8 text-center space-y-2">
          {loadingSnapshots ? (
            <p className="text-sm text-muted-foreground">
              Loading snapshots for this track...
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                No snapshots for this track yet
              </p>
              <p className="text-xs text-muted-foreground">
                Go to the <strong>Run Automation</strong> page for this
                track and click <strong>Run now</strong> to generate the
                first snapshot, then come back here.
              </p>
            </>
          )}
          {snapshotsError && (
            <p className="text-sm text-destructive mt-2">
              {snapshotsError}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
