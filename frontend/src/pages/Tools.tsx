import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEntitlements, useSelectTools } from "@/hooks/use-entitlements";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_TOOLS = [
  {
    key: "ntr",
    name: "NicheTrendRadar",
    description: "Track product niches and detect emerging trends.",
    entitled: false,
    selected: false,
  },
  {
    key: "nutrition",
    name: "Nutrition",
    description: "Track meals, macros, and weight in one nutrition diary.",
    entitled: false,
    selected: false,
  },
];

export default function Tools() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useEntitlements();
  const selectTools = useSelectTools();

  const tools = data?.tools?.length ? data.tools : DEFAULT_TOOLS;
  const isReadOnly = data?.is_read_only ?? false;
  const canWrite = data?.status === "active" && !isReadOnly;
  const currentPass = data?.current_pass;
  const limit = currentPass?.tool_limit ?? 0;

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  useEffect(() => {
    setSelectedKeys(data?.selected_tool_keys ?? []);
  }, [data?.selected_tool_keys]);

  const handleOpen = (key: string, entitled: boolean) => {
    if (!entitled) {
      navigate("/dashboard/billing");
      return;
    }
    if (key === "ntr") {
      navigate("/tools/ntr");
      return;
    }
    navigate(`/tools/${key}`);
  };

  const handleToggleSelection = (toolKey: string) => {
    if (!canWrite) return;
    setSelectedKeys((prev) => {
      const has = prev.includes(toolKey);
      if (has) return prev.filter((key) => key !== toolKey);
      if (limit && prev.length >= limit) {
        toast({
          title: "No free slots",
          description: `Your pass allows up to ${limit} tool(s).`,
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, toolKey];
    });
  };

  const handleSaveSelection = async () => {
    try {
      await selectTools.mutateAsync({ selected_tool_keys: selectedKeys });
      toast({
        title: "Selection saved",
        description: "Your tool selection has been updated.",
      });
      refetch();
    } catch (err) {
      toast({
        title: "Could not save selection",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Tools</h1>
          <p className="text-muted-foreground">
            Enter entitled workspaces and manage which tools are selected in your pass.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Slots used: {selectedKeys.length}/{limit || "—"}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleSaveSelection}
          disabled={!canWrite || selectTools.isPending}
        >
          {selectTools.isPending ? "Saving..." : "Save selection"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Loading tools...</p>
          </Card>
        )}

        {!isLoading &&
          tools.map((tool) => {
            const selected = selectedKeys.includes(tool.key);
            const entitled = Boolean(tool.entitled);
            const statusLabel = entitled ? (isReadOnly ? "Read-only" : "Available") : "Locked";
            const badgeVariant = entitled ? "secondary" : "outline";

            return (
              <Card
                key={tool.key}
                className={`hover-lift transition-all duration-300 hover:shadow-lg ${
                  entitled ? "" : "opacity-80"
                }`}
              >
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
                      {tool.key === "ntr" ? (
                        <Zap className="h-5 w-5 text-primary" />
                      ) : (
                        <Sparkles className="h-5 w-5 text-accent-foreground" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{tool.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>
                  <Badge variant={badgeVariant}>{statusLabel}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Selected in pass</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => handleToggleSelection(tool.key)}
                      disabled={!canWrite}
                    />
                  </div>
                  <Button
                    className="w-full"
                    variant={entitled ? "default" : "outline"}
                    onClick={() => handleOpen(tool.key, entitled)}
                  >
                    {entitled ? "Enter workspace" : "View plans"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
