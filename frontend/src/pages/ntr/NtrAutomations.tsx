// frontend/src/pages/ntr/NtrAutomations.tsx

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { NtrPlatform, NtrTrack } from "@/types/ntr";
import { mockTracks } from "@/lib/ntrMockData";
import { useToast } from "@/hooks/use-toast";
import { useToolAccess } from "@/hooks/use-entitlements";

// Shape of a TrendSnapshot as returned by the backend
type SnapshotApi = {
  id: number;
  track: number;
  run_at: string;
  platform: string;
  source: string;
  metrics: Record<string, unknown>;
  summary: string;
  created_at: string;
};

// What the /run-mock endpoint returns: updated track + new snapshot
type RunMockResponse = {
  track: TrackApi;
  snapshot: SnapshotApi;
};



type TrackApi = {
  id: number;
  name: string;
  keywords: string[];
  market_region: string;
  category: string;
  status: "active" | "paused";
  frequency: "daily" | "weekly";

  // NEW: backend fields
  platform: NtrPlatform;
  country: string | null;
  language: string | null;

  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type TrackCreateBody = {
  name: string;
  keywords: string[];
  market_region: string;
  category: string;
  status: "active" | "paused";
  frequency: "daily" | "weekly";

  // NEW
  platform: NtrPlatform;
  country: string;
  language: string;
};

// Body we send when updating a track (all fields optional for PATCH)
type TrackUpdateBody = Partial<TrackCreateBody>;

type AlertRuleApi = {
  id: number;
  rule_type: string;
  threshold_value: number;
  enabled: boolean;
  cooldown_minutes: number;
  channels: string[];
};

type AlertRulesResponse = {
  ok: boolean;
  rules: AlertRuleApi[];
};

const allowedPlatforms = ["youtube", "mercadolibre"] as const;
const sanitizePlatform = (platform: string | null | undefined): NtrPlatform =>
  allowedPlatforms.includes(platform as (typeof allowedPlatforms)[number])
    ? (platform as NtrPlatform)
    : "youtube";

const MERCADOLIBRE_COUNTRIES = [
  { code: "AR", label: "Argentina" },
  { code: "BO", label: "Bolivia" },
  { code: "BR", label: "Brazil" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colombia" },
  { code: "CR", label: "Costa Rica" },
  { code: "DO", label: "Dominican Republic" },
  { code: "EC", label: "Ecuador" },
  { code: "GT", label: "Guatemala" },
  { code: "HN", label: "Honduras" },
  { code: "MX", label: "Mexico" },
  { code: "NI", label: "Nicaragua" },
  { code: "PA", label: "Panama" },
  { code: "PY", label: "Paraguay" },
  { code: "PE", label: "Peru" },
  { code: "SV", label: "El Salvador" },
  { code: "UY", label: "Uruguay" },
  { code: "VE", label: "Venezuela" },
] as const;
const MERCADOLIBRE_COUNTRY_CODES = MERCADOLIBRE_COUNTRIES.map((c) => c.code);

export default function NtrAutomations() {
  const { toast } = useToast();
  const { isReadOnly } = useToolAccess("ntr");
  const emptyBody: Record<string, never> = {};

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Something went wrong. Please try again.";
  };

  // --------- TRACK LIST STATE ---------

  // Start with mocks, then replace with real data from the API
  const [tracks, setTracks] = useState<NtrTrack[]>(mockTracks);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which track is currently running "Run now" (to disable button / show loading)
  const [runningTrackId, setRunningTrackId] = useState<string | null>(null);

  // --------- SIDE PANEL STATE (CREATE + EDIT) ---------

  /**
   * panelMode:
   * - "create" => we are creating a brand new track
   * - "edit"   => we are editing an existing track
   * - null     => panel is closed
   */
  const [panelMode, setPanelMode] = useState<"create" | "edit" | null>(null);

  // When editing, we remember which track ID we are editing
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);

  // Shared form fields for both "create" and "edit"
  const [newName, setNewName] = useState("");
  const [newKeywordsText, setNewKeywordsText] = useState("");
  const [newMarketRegion, setNewMarketRegion] = useState("Global");
  const [newCategory, setNewCategory] = useState("");
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly">("daily");
  const [newStatus, setNewStatus] = useState<"active" | "paused">("active");
  const [newPlatform, setNewPlatform] = useState<NtrPlatform>("youtube");
  const [newCountry, setNewCountry] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [engagementThreshold, setEngagementThreshold] = useState(5);
  const [viewsSpikeThreshold, setViewsSpikeThreshold] = useState(25);
  const [viewsDropThreshold, setViewsDropThreshold] = useState(25);
  const [cooldownMinutes, setCooldownMinutes] = useState(360);

  // Form status
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // --------- LOAD TRACKS FROM BACKEND ---------

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        setLoading(true);
        setError(null);

        // GET /api/ntr/tracks/
        const data = await apiGet<TrackApi[]>("/ntr/tracks/");

        // Map snake_case -> camelCase for frontend
        const normalized: NtrTrack[] = data.map((track) => ({
          id: String(track.id),
          name: track.name,
          keywords: track.keywords ?? [],
          marketRegion: track.market_region,
          category: track.category ?? "",
          status: track.status,
          frequency: track.frequency,
          platform: sanitizePlatform(track.platform),
          country: track.country ?? "",
          language: track.language ?? "",
          lastRunAt: track.last_run_at ?? undefined,
          nextRunAt: track.next_run_at ?? undefined,
        }));

        setTracks(normalized);
      } catch (err: unknown) {
        console.error("Error loading NTR tracks", err);
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchTracks();
  }, []);

  // --------- HELPERS TO OPEN/CLOSE PANEL ---------

  // Reset form to defaults
  const resetForm = () => {
    setNewName("");
    setNewKeywordsText("");
    setNewMarketRegion("Global");
    setNewCategory("");
    setNewFrequency("daily");
    setNewStatus("active");
    setNewPlatform("youtube");
    setNewCountry("");
    setNewLanguage("");
    setAlertsEnabled(false);
    setEngagementThreshold(5);
    setViewsSpikeThreshold(25);
    setViewsDropThreshold(25);
    setCooldownMinutes(360);
    setFormError(null);
    setEditingTrackId(null);
  };

  const openCreatePanel = () => {
    if (isReadOnly) {
      toast({
        title: "Read-only mode",
        description: "You can’t create tracks while your subscription is on hold.",
      });
      return;
    }
    resetForm();
    setPanelMode("create");
  };

  const openEditPanel = (track: NtrTrack) => {
    // Pre-fill all form fields with the selected track data
    setEditingTrackId(track.id);
    setNewName(track.name);
    setNewKeywordsText(track.keywords.join(", "));
    setNewMarketRegion(track.marketRegion || "Global");
    setNewCategory(track.category || "");
    setNewFrequency(track.frequency);
    setNewStatus(track.status);
    setNewPlatform(track.platform);
    setNewCountry(track.country || "");
    setNewLanguage(track.language || "");
    setFormError(null);
    setPanelMode("edit");

    apiGet<AlertRulesResponse>(`/ntr/tracks/${track.id}/alert-rules/`)
      .then((res) => {
        const rules = res.rules || [];
        const engagementRule = rules.find((r) => r.rule_type === "engagement_gt");
        const viewsSpikeRule = rules.find((r) => r.rule_type === "views_spike_pct");
        const viewsDropRule = rules.find((r) => r.rule_type === "views_drop_pct");
        const anyEnabled = rules.some((r) => r.enabled);
        setAlertsEnabled(anyEnabled);
        setEngagementThreshold(engagementRule?.threshold_value ?? 5);
        setViewsSpikeThreshold(viewsSpikeRule?.threshold_value ?? 25);
        setViewsDropThreshold(viewsDropRule?.threshold_value ?? 25);
        setCooldownMinutes(
          engagementRule?.cooldown_minutes ??
            viewsSpikeRule?.cooldown_minutes ??
            viewsDropRule?.cooldown_minutes ??
            360,
        );
      })
      .catch((err) => {
        console.error("Failed to load alert rules", err);
      });
  };

  const closePanel = () => {
    setPanelMode(null);
  };

  useEffect(() => {
    if (newPlatform === "mercadolibre") {
      setNewLanguage("");
    }
  }, [newPlatform]);

  // --------- HANDLE SAVE (CREATE OR EDIT) ---------

  const handleSaveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast({
        title: "Read-only mode",
        description: "You can’t edit tracks while your subscription is on hold.",
      });
      return;
    }

    if (!newName.trim()) {
      setFormError("Track name is required.");
      return;
    }

    const sanitizedCountry = newCountry.trim().toUpperCase().replace(/"/g, "");
    const sanitizedLanguage = newLanguage.trim().replace(/"/g, "");

    if (sanitizedCountry.length > 2) {
      setFormError("Country codes must be 2 letters (e.g. US, DE).");
      return;
    }

    if (
      newPlatform === "mercadolibre" &&
      sanitizedCountry &&
      !MERCADOLIBRE_COUNTRY_CODES.includes(sanitizedCountry as (typeof MERCADOLIBRE_COUNTRY_CODES)[number])
    ) {
      setFormError("Please choose a MercadoLibre-supported country.");
      return;
    }

    if (sanitizedLanguage.length > 5) {
      setFormError("Language codes should be 5 characters max (e.g. en, de, pt-BR).");
      return;
    }

    // Turn comma-separated text into an array
    const keywordsArray = newKeywordsText
      .split(",")
      .map((kw) => kw.trim())
      .filter((kw) => kw.length > 0);

    // Body to send to the backend
    const body: TrackCreateBody = {
      name: newName.trim(),
      keywords: keywordsArray,
      market_region: newMarketRegion || "Global",
      category: newCategory.trim(),
      status: newStatus,
      frequency: newFrequency,
      platform: newPlatform,
      country: sanitizedCountry,
      language: sanitizedLanguage,
    };

    try {
      setSaving(true);
      setFormError(null);

      const saveAlertRules = async (trackId: string) => {
        const payload = {
          enabled: alertsEnabled,
          cooldown_minutes: cooldownMinutes,
          channels: ["email"],
          rules: [
            {
              rule_type: "engagement_gt",
              threshold_value: engagementThreshold,
            },
            {
              rule_type: "views_spike_pct",
              threshold_value: viewsSpikeThreshold,
            },
            {
              rule_type: "views_drop_pct",
              threshold_value: viewsDropThreshold,
            },
          ],
        };
        await apiPost<typeof payload, AlertRulesResponse>(
          `/ntr/tracks/${trackId}/alert-rules/`,
          payload,
        );
      };

      if (panelMode === "create") {
        // 1) CREATE = POST /api/ntr/tracks/
        const created = await apiPost<TrackCreateBody, TrackApi>("/ntr/tracks/", body);

        const normalized: NtrTrack = {
          id: String(created.id),
          name: created.name,
          keywords: created.keywords ?? [],
          marketRegion: created.market_region,
          category: created.category ?? "",
          status: created.status,
          frequency: created.frequency,
          platform: sanitizePlatform(created.platform),
          country: created.country ?? "",
          language: created.language ?? "",
          lastRunAt: created.last_run_at ?? undefined,
          nextRunAt: created.next_run_at ?? undefined,
        };

        // Put the new track at the top of the list
        setTracks((prev) => [normalized, ...prev]);
        await saveAlertRules(normalized.id);
        resetForm();
        // Optionally close the panel after creating
        // setPanelMode(null);
      }

      if (panelMode === "edit" && editingTrackId) {
        // 2) EDIT = PATCH /api/ntr/tracks/:id/
        const updateBody: TrackUpdateBody = body; // all fields as partial

        const updated = await apiPatch<TrackUpdateBody, TrackApi>(
          `/ntr/tracks/${editingTrackId}/`,
          updateBody,
        );

        const normalizedUpdated: NtrTrack = {
          id: String(updated.id),
          name: updated.name,
          keywords: updated.keywords ?? [],
          marketRegion: updated.market_region,
          category: updated.category ?? "",
          status: updated.status,
          frequency: updated.frequency,
          platform: sanitizePlatform(updated.platform),
          country: updated.country ?? "",
          language: updated.language ?? "",
          lastRunAt: updated.last_run_at ?? undefined,
          nextRunAt: updated.next_run_at ?? undefined,
        };

        // Replace the track in local state
        setTracks((prev) =>
          prev.map((t) => (t.id === editingTrackId ? normalizedUpdated : t)),
        );

        await saveAlertRules(normalizedUpdated.id);

        // Close panel after successful edit
        closePanel();
      }
    } catch (err: unknown) {
      console.error("Error saving NTR track", err);
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // --------- HANDLE DELETE ---------

  const handleDeleteTrack = async (id: string) => {
    if (isReadOnly) {
      toast({
        title: "Read-only mode",
        description: "You can’t delete tracks while your subscription is on hold.",
      });
      return;
    }
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this trend track? This cannot be undone.",
    );

    if (!confirmDelete) return;

    try {
      // DELETE /api/ntr/tracks/:id/
      await apiDelete(`/ntr/tracks/${id}/`);

      // Remove from local state
      setTracks((prev) => prev.filter((t) => t.id !== id));

      // If we were editing this same track, close the panel
      if (editingTrackId === id) {
        closePanel();
      }
    } catch (err: unknown) {
      console.error("Error deleting NTR track", err);
      alert(getErrorMessage(err));
    }
  };

  // --------- HANDLE TOGGLE STATUS ---------

  const handleToggleStatus = async (id: string) => {
    if (isReadOnly) {
      toast({
        title: "Read-only mode",
        description: "You can’t change track status while your subscription is on hold.",
      });
      return;
    }
    const track = tracks.find((t) => t.id === id);
    if (!track) return;

    const newStatus: "active" | "paused" =
      track.status === "active" ? "paused" : "active";

    try {
      await apiPatch<TrackUpdateBody, TrackApi>(`/ntr/tracks/${id}/`, {
        status: newStatus,
      });

      setTracks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: newStatus,
              }
            : t,
        ),
      );
    } catch (err: unknown) {
      console.error("Error toggling NTR track status", err);
      alert(getErrorMessage(err));
    }
  };

  // --------- HANDLE "RUN NOW" (mock automation) ---------

  const handleRunNow = async (id: string) => {
    if (isReadOnly) {
      toast({
        title: "Read-only mode",
        description: "You can’t run automations while your subscription is on hold.",
      });
      return;
    }
    try {
      // Mark this track as "running" so we can disable its button in the UI
      setRunningTrackId(id);

      // Call POST /api/ntr/tracks/<id>/run-mock/
      // We send an empty object {} as body, since the backend doesn't need extra data for now
      const res = await apiPost<Record<string, never>, RunMockResponse>(
        `/ntr/tracks/${id}/run-mock/`,
        emptyBody,
      );

      // Normalize the returned track (snake_case -> camelCase) so it fits our NtrTrack type
      const updatedTrackFromApi = res.track;

      const normalizedUpdatedTrack: NtrTrack = {
        id: String(updatedTrackFromApi.id),
        name: updatedTrackFromApi.name,
        keywords: updatedTrackFromApi.keywords ?? [],
        marketRegion: updatedTrackFromApi.market_region,
        category: updatedTrackFromApi.category ?? "",
        status: updatedTrackFromApi.status,
        frequency: updatedTrackFromApi.frequency,
        platform: sanitizePlatform(updatedTrackFromApi.platform),
        country: updatedTrackFromApi.country ?? "",
        language: updatedTrackFromApi.language ?? "",
        lastRunAt: updatedTrackFromApi.last_run_at ?? undefined,
        nextRunAt: updatedTrackFromApi.next_run_at ?? undefined,
      };

      // Update the track list in state with the new values
      setTracks((prev) =>
        prev.map((t) => (t.id === normalizedUpdatedTrack.id ? normalizedUpdatedTrack : t)),
      );

      const metrics = res.snapshot?.metrics ?? {};
      const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

      const pickNumber = (keys: string[], fallback = 0): number => {
        for (const key of keys) {
          const value = metrics?.[key];
          if (typeof value === "number" && Number.isFinite(value)) return value;
        }
        return fallback;
      };

      if (normalizedUpdatedTrack.platform === "youtube") {
        const totalViews = pickNumber(["total_views", "search_volume", "searchVolume"], 0);
        const videoCount = pickNumber(["video_count", "mention_count", "productCount"], 0);
        const avgViews = pickNumber(["avg_views", "price_index", "avgPrice"], 0);
        const engagementRate = pickNumber(["engagement_rate", "sentiment_score", "sentimentScore"], 0);

        toast({
          title: "YouTube snapshot created",
          description:
            `Total views (sample): ${numberFmt.format(totalViews)} • ` +
            `Videos: ${numberFmt.format(videoCount)} • ` +
            `Avg views/video: ${numberFmt.format(avgViews)} • ` +
            `Engagement: ${(engagementRate * 100).toFixed(2)}%`,
        });

        // Keep console output useful, but avoid legacy field-name confusion like "avgPrice".
        console.log("New YouTube snapshot created:", {
          track: normalizedUpdatedTrack.name,
          keyword: normalizedUpdatedTrack.keywords?.[0] ?? normalizedUpdatedTrack.name,
          total_views: totalViews,
          video_count: videoCount,
          avg_views: avgViews,
          engagement_rate: engagementRate,
          note: "These metrics are aggregated across the top search results for the keyword, not your channel totals.",
        });
      } else {
        const searchVolume = pickNumber(["search_volume", "searchVolume", "total_results"], 0);
        const mentionCount = pickNumber(["mention_count", "mentionCount", "sampled_count"], 0);
        const priceIndex = pickNumber(["price_index", "priceIndex", "avgPrice", "avg_price"], 0);
        const sentimentScore = pickNumber(["sentiment_score", "sentimentScore"], 0);

        toast({
          title: "MercadoLibre snapshot created",
          description:
            `Listings: ${numberFmt.format(searchVolume)} • ` +
            `Sampled: ${numberFmt.format(mentionCount)} • ` +
            `Avg price: ${numberFmt.format(priceIndex)} • ` +
            `Sales density: ${(sentimentScore * 100).toFixed(2)}%`,
        });

        console.log("New snapshot created:", res.snapshot);
      }
    } catch (err: unknown) {
      console.error("Error running mock automation", err);
      alert(getErrorMessage(err));
    } finally {
      // Clear the running flag so the button is enabled again
      setRunningTrackId(null);
    }
  };

  // --------- RENDER ---------

  return (
    <div className="space-y-6 animate-in">
      {/* Page header with "Add Trend Track" button */}
      <PageHeader
        title="NicheTrendRadar Automations"
        description="Manage the trend tracks that keep watch on your favorite niches."
        icon={Zap}
        action={
          <Button onClick={openCreatePanel} disabled={isReadOnly}>
            + Add Trend Track
          </Button>
        }
      />

      {/* Two-column layout on large screens:
          - Left: list of tracks
          - Right: create/edit panel (only when panelMode is not null)
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* LEFT: TRACK LIST + STATUS MESSAGES */}
        <div className="space-y-4">
          {/* Loading / error messages */}
          {loading && (
            <p className="text-sm text-muted-foreground">Loading your tracks...</p>
          )}

          {!loading && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* If there are no tracks */}
          {!loading && !error && tracks.length === 0 && (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">
                You do not have any tracks yet. Click &quot;Add Trend Track&quot; to create your first one.
              </p>
            </Card>
          )}

          {/* If there ARE tracks, show them as cards */}
          {tracks.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tracks.map((track) => (
                <Card
                  key={track.id}
                  className="p-5 hover-lift transition-all duration-300 hover:shadow-lg"
                >
                  {/* Track name + status + toggle */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold">{track.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        Market: {track.marketRegion || "Global"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={track.status === "active" ? "default" : "secondary"}>
                        {track.status === "active" ? "Active" : "Paused"}
                      </Badge>
                      <Switch
                        checked={track.status === "active"}
                        onCheckedChange={() => handleToggleStatus(track.id)}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>

                  {/* Frequency + category */}
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-muted-foreground">
                    <span>
                      Frequency:
                      <strong className="ml-1 capitalize">{track.frequency}</strong>
                    </span>
                    {track.category && (
                      <span>
                        • Category:
                        <strong className="ml-1">{track.category}</strong>
                      </span>
                    )}
                  </div>

                  {/* Keywords */}
                  <div className="mb-4">
                    <p className="text-xs font-medium mb-1 text-muted-foreground">
                      Keywords watched:
                    </p>
                    {track.keywords.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {track.keywords.map((kw, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No keywords set yet.
                      </p>
                    )}

                    {/* Last run info (if available) */}
                    {track.lastRunAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last run{" "}
                        {formatDistanceToNow(new Date(track.lastRunAt), { addSuffix: true })}
                      </p>
                    )}
                  </div>

                  {/* Actions: Run now + Edit + Delete */}
                  <div className="flex flex-col gap-2">
                    {/* Top row: Run now */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      // Disable the button if:
                      // - this track is currently running, OR
                      // - the track is paused
                      disabled={isReadOnly || runningTrackId === track.id || track.status === "paused"}
                      onClick={() => handleRunNow(track.id)}
                    >
                      {track.status === "paused"
                        ? "Paused"
                        : runningTrackId === track.id
                        ? "Running..."
                        : "Run now"}
                    </Button>

                    {/* Bottom row: Edit + Delete */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEditPanel(track)}
                        disabled={isReadOnly}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteTrack(track.id)}
                        disabled={isReadOnly}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: CREATE/EDIT TRACK PANEL (only if panelMode is not null) */}
        {panelMode && (
          <Card className="p-6 space-y-4 self-start">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  {panelMode === "create"
                    ? "Create a new trend track"
                    : "Edit trend track"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {panelMode === "create"
                    ? "Describe the niche you want to monitor. You can always edit this later."
                    : "Update the details for this track and save your changes."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-2"
                onClick={closePanel}
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form className="space-y-4" onSubmit={handleSaveTrack}>
              {/* Track name */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Track name</label>
                <Input
                  placeholder='e.g. "Standing desks in EU"'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isReadOnly}
                />
              </div>

              {/* Keywords */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Keywords (comma separated)</label>
                <Input
                  placeholder='e.g. "standing desk, sit stand desk"'
                  value={newKeywordsText}
                  onChange={(e) => setNewKeywordsText(e.target.value)}
                  disabled={isReadOnly}
                />
                <p className="text-xs text-muted-foreground">
                  We will store this as a list like ["standing desk", "sit stand desk"] in the backend.
                </p>
              </div>

              {/* Market + Category */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Market / Region</label>
                  <Input
                    placeholder='e.g. "EU", "US", or "Global"'
                    value={newMarketRegion}
                    onChange={(e) => setNewMarketRegion(e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Category (optional)</label>
                  <Input
                    placeholder='e.g. "ecommerce", "fitness", "SaaS"'
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              {/* Platform */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Platform</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newPlatform}
                  onChange={(e) =>
                    setNewPlatform(e.target.value as NtrPlatform)
                  }
                  disabled={isReadOnly}
                >
                  <option value="youtube">YouTube</option>
                  <option value="mercadolibre">MercadoLibre</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  This tells the engine where to search for trends (YouTube, MercadoLibre...).
                </p>
              </div>

              {/* Country + Language */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Country (optional)
                  </label>
                  {newPlatform === "mercadolibre" ? (
                    <>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value)}
                        disabled={isReadOnly}
                      >
                        <option value="">Auto (default MLA)</option>
                        {MERCADOLIBRE_COUNTRIES.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.label} ({country.code})
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Choose the MercadoLibre country marketplace.
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        placeholder='e.g. "US", "DE", "MK"'
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value)}
                        disabled={isReadOnly}
                      />
                      <p className="text-xs text-muted-foreground">
                        Two-letter country code. Leave empty for global.
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Language (optional)
                  </label>
                  {newPlatform === "mercadolibre" ? (
                    <p className="text-xs text-muted-foreground pt-2">
                      Not used for MercadoLibre.
                    </p>
                  ) : (
                    <>
                      <Input
                        placeholder='e.g. "en", "de", "mk"'
                        value={newLanguage}
                        onChange={(e) => setNewLanguage(e.target.value)}
                        disabled={isReadOnly}
                      />
                      <p className="text-xs text-muted-foreground">
                        Language code for content (if supported by the engine).
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Frequency */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Frequency</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newFrequency}
                  onChange={(e) =>
                    setNewFrequency(e.target.value as "daily" | "weekly")
                  }
                  disabled={isReadOnly}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  This controls how often the automation should refresh the trend data
                  (we will implement the actual scheduling later).
                </p>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Status</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newStatus}
                  onChange={(e) =>
                    setNewStatus(e.target.value as "active" | "paused")
                  }
                  disabled={isReadOnly}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Active tracks are monitored by the automation. Paused tracks are ignored.
                </p>
              </div>

              {/* Alert Rules */}
              <div className="space-y-3 rounded-md border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">Alerts</label>
                    <p className="text-xs text-muted-foreground">
                      Get notified when views spike or engagement jumps.
                    </p>
                  </div>
                  <Switch
                    checked={alertsEnabled}
                    onCheckedChange={(value) => setAlertsEnabled(value)}
                    disabled={isReadOnly}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Engagement threshold (%)
                    </label>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engagementThreshold}
                        onChange={(e) => setEngagementThreshold(Number(e.target.value))}
                        disabled={isReadOnly || !alertsEnabled}
                      />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Views spike threshold (%)
                    </label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={viewsSpikeThreshold}
                        onChange={(e) => setViewsSpikeThreshold(Number(e.target.value))}
                        disabled={isReadOnly || !alertsEnabled}
                      />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Views drop threshold (%)
                    </label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={viewsDropThreshold}
                        onChange={(e) => setViewsDropThreshold(Number(e.target.value))}
                        disabled={isReadOnly || !alertsEnabled}
                      />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Cooldown</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                    disabled={isReadOnly || !alertsEnabled}
                  >
                    <option value={60}>1 hour</option>
                    <option value={360}>6 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </div>
              </div>

              {/* Error + submit */}
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <Button type="submit" disabled={saving || isReadOnly} className="w-full">
                {saving
                  ? "Saving..."
                  : panelMode === "create"
                  ? "Create Track"
                  : "Save Changes"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
