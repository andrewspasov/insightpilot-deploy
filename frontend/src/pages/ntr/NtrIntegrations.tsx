// import { PageHeader } from "@/components/dashboard/PageHeader";
// import { IntegrationSourceCard } from "@/components/ntr/IntegrationSourceCard";
// import { Plug } from "lucide-react";
// import { mockIntegrationSources } from "@/lib/ntrMockData";
// import { useToast } from "@/hooks/use-toast";

// export default function NtrIntegrations() {
//   const { toast } = useToast();

//   const handleConnect = (id: string) => {
//     toast({
//       title: "Connect integration",
//       description: `Integration ${id} connection flow would open here.`,
//     });
//   };

//   const handleManage = (id: string) => {
//     toast({
//       title: "Manage integration",
//       description: `Integration ${id} settings would open here.`,
//     });
//   };

//   return (
//     <div className="space-y-6 animate-in">
//       <PageHeader
//         title="Data Sources"
//         description="Connect external platforms to gather trend signals"
//         icon={Plug}
//       />

//       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
//         {mockIntegrationSources.map((source, index) => (
//           <div
//             key={source.id}
//             className="animate-scale-in"
//             style={{ animationDelay: `${index * 100}ms` }}
//           >
//             <IntegrationSourceCard
//               source={source}
//               onConnect={handleConnect}
//               onManage={handleManage}
//             />
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }



// frontend/src/pages/ntr/Integrations.tsx

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plug } from "lucide-react";

import { apiGet, apiPatch } from "@/lib/api";
import { NtrPlatform, NtrSettings } from "@/types/ntr";
import { useToolAccess } from "@/hooks/use-entitlements";

// Shape we get back from Django (snake_case keys)
type NtrSettingsApi = {
  platforms: NtrPlatform[];
  sources: string[];
  created_at: string;
  updated_at: string;
};

// Shape we send when updating (both fields optional for PATCH)
type NtrSettingsUpdateBody = Partial<{
  platforms: NtrPlatform[];
  sources: string[];
}>;

// These are the options the user can toggle ON/OFF.
// Platforms: YouTube, MercadoLibre.
const PLATFORM_OPTIONS: { id: NtrPlatform; label: string; description: string }[] = [
  { id: "youtube", label: "YouTube", description: "Monitor YouTube search trends for your products." },
  { id: "mercadolibre", label: "MercadoLibre", description: "Monitor marketplace activity on MercadoLibre." },
];

// Example “sources” inside those platforms.
// You can rename these later if you want different categories.
const SOURCE_OPTIONS = [
  {
    id: "search_trends",
    label: "Search trends",
    description: "Track how much people are searching for this niche.",
  },
  {
    id: "product_reviews",
    label: "Product reviews",
    description: "Analyze reviews and feedback on these platforms.",
  },
  {
    id: "social_buzz",
    label: "Social buzz",
    description: "Look at social chatter and mentions for this niche.",
  },
];

export default function NtrIntegrations() {
  const { isReadOnly } = useToolAccess("ntr");
  // --------- STATE FOR SETTINGS + UI STATUS ---------

  // This holds the latest settings we got from the backend.
  const [settings, setSettings] = useState<NtrSettings | null>(null);

  // These two arrays are what we actually bind to the switches / toggles.
  // We copy them from `settings` so the user can edit them before saving.
  const [selectedPlatforms, setSelectedPlatforms] = useState<NtrPlatform[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  // Loading / saving flags and error/success messages
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // --------- LOAD SETTINGS FROM BACKEND ONCE ---------

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);

        // GET /api/ntr/settings/
        const data = await apiGet<NtrSettingsApi>("/ntr/settings/");

        // Map snake_case -> camelCase for our frontend type
        const normalized: NtrSettings = {
          platforms: data.platforms ?? [],
          sources: data.sources ?? [],
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };

        setSettings(normalized);
        setSelectedPlatforms(normalized.platforms);
        setSelectedSources(normalized.sources);
      } catch (err) {
        console.error("Failed to load NTR settings", err);
        setError("Could not load your NicheTrendRadar settings. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []); // empty dependency array: runs once on page load

  // --------- SMALL HELPER: TOGGLE SOMETHING IN AN ARRAY ---------

  const toggleItem = <T extends string>(value: T, current: T[], setter: (next: T[]) => void) => {
    // If the value is already in the array -> remove it
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      // If it is not there -> add it to the array
      setter([...current, value]);
    }
  };

  // --------- HANDLER: SAVE SETTINGS BACK TO BACKEND ---------

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveMessage(null);

      const body: NtrSettingsUpdateBody = {
        platforms: selectedPlatforms,
        sources: selectedSources,
      };

      // PATCH /api/ntr/settings/ with the new arrays
      const updated = await apiPatch<NtrSettingsUpdateBody, NtrSettingsApi>(
        "/ntr/settings/",
        body,
      );

      // Normalize again and store in state
      const normalized: NtrSettings = {
        platforms: updated.platforms ?? [],
        sources: updated.sources ?? [],
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };

      setSettings(normalized);
      setSelectedPlatforms(normalized.platforms);
      setSelectedSources(normalized.sources);
      setSaveMessage("Settings saved successfully.");
    } catch (err: any) {
      console.error("Failed to save NTR settings", err);
      setError(err.message || "Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // --------- RENDER ---------

  return (
    <div className="space-y-6 animate-in">
      {/* Page header at the top */}
      <PageHeader
        title="Integrations & Data Sources"
        description="Choose which marketplaces and data sources NicheTrendRadar should use."
        icon={Plug}
      />

      {/* Status messages */}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading your settings...</p>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && saveMessage && (
        <p className="text-sm text-emerald-500">{saveMessage}</p>
      )}

      {/* Main grid: Platforms on the left, Sources on the right */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* PLATFORMS CARD */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Marketplaces</h2>
              <p className="text-sm text-muted-foreground">
                Turn on the platforms where your products or niches live.
              </p>
            </div>
            <Badge variant="outline">
              {selectedPlatforms.length} selected
            </Badge>
          </div>

          <div className="space-y-3">
            {PLATFORM_OPTIONS.map((platform) => {
              const enabled = selectedPlatforms.includes(platform.id);
              return (
                <div
                  key={platform.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-muted/60"
                >
                  <div>
                    <p className="text-sm font-medium">{platform.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {platform.description}
                    </p>
                  </div>

                  {/* Switch component to enable/disable this platform */}
                  <Switch
                    checked={enabled}
                    onCheckedChange={() =>
                      toggleItem(platform.id, selectedPlatforms, setSelectedPlatforms)
                    }
                    disabled={isReadOnly}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {/* SOURCES CARD */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Data sources</h2>
              <p className="text-sm text-muted-foreground">
                Choose which kinds of signals NicheTrendRadar should collect.
              </p>
            </div>
            <Badge variant="outline">
              {selectedSources.length} selected
            </Badge>
          </div>

          <div className="space-y-3">
            {SOURCE_OPTIONS.map((source) => {
              const enabled = selectedSources.includes(source.id);
              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-muted/60"
                >
                  <div>
                    <p className="text-sm font-medium">{source.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.description}
                    </p>
                  </div>

                  <Switch
                    checked={enabled}
                    onCheckedChange={() =>
                      toggleItem(source.id, selectedSources, setSelectedSources)
                    }
                    disabled={isReadOnly}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* SAVE BUTTON */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={loading || saving || isReadOnly}
        >
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
