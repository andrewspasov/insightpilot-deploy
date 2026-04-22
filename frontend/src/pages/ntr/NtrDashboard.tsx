import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AIInsightCard } from "@/components/dashboard/AIInsightCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, RefreshCw, FileText } from "lucide-react";
import { useToolAccess } from "@/hooks/use-entitlements";

import {
  mockActivity,
  mockSubscription,
} from "@/lib/ntrMockData";

import {
  NtrTrack,
  TrendSnapshotApi,
  NtrTrendSnapshot,
} from "@/types/ntr";
import { apiGet } from "@/lib/api";

// This type matches exactly what your Django TrackSerializer returns (snake_case keys).
// It represents the shape of the JSON from /api/ntr/tracks/.
type TrackApi = {
  id: number;
  name: string;
  keywords: string[];        // Comes from your JSONField
  market_region: string;
  category: string;
  status: "active" | "paused";
  frequency: "daily" | "weekly";
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function NtrDashboard() {
  const navigate = useNavigate();
  const { isReadOnly } = useToolAccess("ntr");

  // =========================
  // 1. State for live tracks
  // =========================

  // This holds the list of tracks that the logged in user owns.
  const [tracks, setTracks] = useState<NtrTrack[]>([]);

  // Simple loading flag for the initial fetch.
  const [loading, setLoading] = useState<boolean>(false);

  // Error message if the API call fails.
  const [error, setError] = useState<string | null>(null);

  // Snapshots from the backend (used for refresh time + report count)
  const [snapshots, setSnapshots] = useState<NtrTrendSnapshot[]>([]);

  // =========================================
  // 2. Load real tracks from the backend once
  // =========================================

  useEffect(() => {
    // Wrap the async work in a helper inside useEffect.
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Call your Django APIs
        const [tracksApi, snapshotsApi] = await Promise.all([
          apiGet<TrackApi[]>("/ntr/tracks/"),
          apiGet<TrendSnapshotApi[]>("/ntr/snapshots/"),
        ]);

        // Map backend snake_case to frontend NtrTrack (camelCase, string id, etc).
        const normalizedTracks: NtrTrack[] = tracksApi.map((track) => ({
          id: String(track.id),                 // we use string ids in the frontend
          name: track.name,
          keywords: track.keywords ?? [],
          marketRegion: track.market_region,
          category: track.category ?? "",
          status: track.status,
          frequency: track.frequency,
          lastRunAt: track.last_run_at ?? undefined,
          nextRunAt: track.next_run_at ?? undefined,
        }));

        // Replace mock data with real user tracks from the backend.
        setTracks(normalizedTracks);

        const normalizedSnapshots: NtrTrendSnapshot[] = snapshotsApi.map((snap) => {
          const metrics = snap.metrics ?? {};

          const searchVolume =
            metrics.search_volume ??
            (metrics as any).searchVolume ??
            (metrics as any).total_views ??
            (metrics as any).totalViews ??
            (snap as any).search_volume ??
            (snap as any).searchVolume ??
            0;
          const mentionCount =
            metrics.mention_count ??
            (metrics as any).mentionCount ??
            (metrics as any).video_count ??
            (metrics as any).videoCount ??
            (metrics as any).productCount ??
            (snap as any).mention_count ??
            (snap as any).mentionCount ??
            0;
          const priceIndex =
            metrics.price_index ??
            (metrics as any).priceIndex ??
            (metrics as any).avg_views ??
            (metrics as any).avgViews ??
            (metrics as any).avgPrice ??
            (snap as any).price_index ??
            (snap as any).priceIndex ??
            0;
          const sentimentScore =
            metrics.sentiment_score ??
            (metrics as any).sentimentScore ??
            (metrics as any).engagement_rate ??
            (metrics as any).engagementRate ??
            (snap as any).sentiment_score ??
            (snap as any).sentimentScore ??
            0;

          const runAt = snap.run_at ?? snap.created_at ?? "";
          const createdAt = snap.created_at ?? runAt ?? "";
          const updatedAt = snap.updated_at ?? createdAt ?? runAt ?? "";
          const trackId = snap.track ?? (snap as any).track_id ?? "";

          return {
            id: String(snap.id),
            trackId: String(trackId),
            runAt: runAt || new Date().toISOString(),
            platform: snap.platform ?? "unknown",
            source: snap.source ?? "",
            metrics: {
              searchVolume,
              mentionCount,
              priceIndex,
              sentimentScore,
            },
            summary: snap.summary ?? "",
            createdAt: createdAt || runAt || new Date().toISOString(),
            updatedAt: updatedAt || createdAt || runAt || new Date().toISOString(),
          };
        });

        setSnapshots(normalizedSnapshots);
      } catch (err) {
        console.error("Failed to load tracks", err);
        setError("Could not load your trend tracks. Please refresh or log in again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // =========================
  // 3. Metrics for top cards
  // =========================

  // Count how many tracks are active.
  const activeTracks = tracks.filter((t) => t.status === "active").length;

  // Sum all keyword arrays across all tracks.
  const totalKeywords = tracks.reduce((sum, t) => sum + t.keywords.length, 0);

  const latestSnapshot = [...snapshots].sort(
    (a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime(),
  )[0];

  const lastRefreshMinutes = latestSnapshot
    ? Math.floor((Date.now() - new Date(latestSnapshot.runAt).getTime()) / (1000 * 60))
    : 0;

  // Count how many snapshots fall in the current week (reports proxy).
  const currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
  const reportsThisWeek = snapshots.filter(
    (snap) => new Date(snap.runAt) >= currentWeekStart,
  ).length;

  const metrics = [
    {
      icon: TrendingUp,
      label: "Active Trend Monitors",
      value: activeTracks,
      subtitle: `${tracks.length} total tracks`,
    },
    {
      icon: Target,
      label: "Keywords Tracked",
      value: totalKeywords,
      subtitle: "Across all niches",
    },
    {
      icon: RefreshCw,
      label: "Last Data Refresh",
      value: `${lastRefreshMinutes}m`,
      subtitle: "ago",
    },
    {
      icon: FileText,
      label: "Reports This Week",
      value: reportsThisWeek,
      subtitle: "Generated",
    },
  ];

  // =========================
  // 4. Navigation handlers
  // =========================

  const handleManagePlan = () => navigate("/dashboard/billing");
  const handleAddTrack = () => navigate("/tools/ntr/automations");
  const handleManageTracks = () => navigate("/tools/ntr/automations");
  const handleOpenTools = () => navigate("/dashboard/tools");
  const handleAskAI = () => navigate("/tools/ntr/ai-assistant");
  const handleOpenReport = () => navigate("/tools/ntr/reports");

  // =========================
  // 5. Render
  // =========================

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">NicheTrendRadar Dashboard</h1>
          <p className="text-muted-foreground">
            Live overview of your tracked niches and trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="px-3 py-1">
            {mockSubscription.name} Plan
          </Badge>
          <Button onClick={handleManagePlan}>Manage Plan</Button>
        </div>
      </div>

      {/* Loading and error messages for tracks */}
      {loading && (
        <p className="text-sm text-muted-foreground">
          Loading your trend tracks from the server...
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-4 py-2">
          {error}
        </p>
      )}

      {/* Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="animate-scale-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <MetricCard {...metric} />
          </div>
        ))}
      </div>

      {/* Main content split: activity + AI insight */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-1 animate-fade-in"
          style={{ animationDelay: "400ms" }}
        >
          <ActivityFeed activities={mockActivity} />
        </div>
        <div
          className="lg:col-span-2 animate-fade-in"
          style={{ animationDelay: "500ms" }}
        >
          <AIInsightCard
            onOpenReport={handleOpenReport}
            onAskAI={handleAskAI}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="animate-fade-in" style={{ animationDelay: "600ms" }}>
        <QuickActions
          onAddTrack={handleAddTrack}
          onManageTracks={handleManageTracks}
          onOpenTools={handleOpenTools}
          onAskAI={handleAskAI}
          disableMutations={isReadOnly}
        />
      </div>
    </div>
  );
}
