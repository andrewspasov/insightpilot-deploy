// NicheTrendRadar Type Definitions

export type NtrPlatform = "youtube" | "mercadolibre";

// One thing the user wants to monitor
export type NtrTrack = {
  id: string;
  name: string;
  keywords: string[];
  marketRegion: string;
  category: string;
  status: "active" | "paused";
  frequency: "daily" | "weekly";

  // NEW FIELDS: engine configuration
  platform: NtrPlatform;
  country?: string;   // optional, may be empty string
  language?: string;  // optional, may be empty string

  lastRunAt?: string;
  nextRunAt?: string;
};


// A higher level report summarizing snapshots
export interface NtrTrendReport {
  id: string;
  trackId: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  highlights: string[];
  risks: string[];
  metrics?: NtrSnapshotMetrics;
}

// Activity and notifications
export interface NtrActivityItem {
  id: string;
  type:
    | "track_created"
    | "track_updated"
    | "track_paused"
    | "snapshot_created"
    | "report_generated"
    | "new_trend_detected"
    | "integration_issue";
  createdAt: string;
  trackId?: string;
  severity: "info" | "warning" | "error";
  message: string;
}

// Data sources
export interface NtrIntegrationSource {
  id: string;
  name: string;
  description: string;
  status: "connected" | "not_connected" | "error";
}

// Subscription display data
export interface SubscriptionPlanSummary {
  name: string;
  maxToolsAllowed: number;
  billingInterval: "monthly" | "annual";
  status: "active" | "trialing" | "past_due" | "canceled";
  currentPeriodEnd?: string;
}

// Tools available in workspace
export interface ToolSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "available" | "locked";
  requiresPlanLevel?: string;
}

// Chat message for AI Assistant
export interface NtrChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  trackId?: string;
}



// NicheTrendRadar user-level settings.
// This mirrors the NtrSettings model on the backend.
export type NtrSettings = {
  platforms: NtrPlatform[]; // e.g. ["youtube", "mercadolibre"]
  sources: string[];   // e.g. ["search_trends", "product_reviews"]
  createdAt?: string;  // optional, mapped from created_at
  updatedAt?: string;  // optional, mapped from updated_at
};



// Snapshot as returned by the API (snake_case)
export type TrendSnapshotMetricsApi = {
  search_volume?: number;
  mention_count?: number;
  price_index?: number;
  sentiment_score?: number;
  [key: string]: number | undefined;
};

export type TrendSnapshotApi = {
  id: number | string;
  track: number | string;
  run_at?: string;
  platform?: string;
  source?: string;
  metrics?: TrendSnapshotMetricsApi;
  summary?: string;
  created_at?: string;
  updated_at?: string;
  search_volume?: number;
  mention_count?: number;
  price_index?: number;
  sentiment_score?: number;
};

// Frontend-friendly camelCase
export type NtrTrendSnapshot = {
  id: string;
  trackId: string;
  runAt: string;
  platform: string;
  source: string;
  metrics: NtrSnapshotMetrics;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type NtrSnapshotMetrics = {
  searchVolume: number;
  mentionCount: number;
  priceIndex: number;
  sentimentScore: number;
  [key: string]: number;
};
