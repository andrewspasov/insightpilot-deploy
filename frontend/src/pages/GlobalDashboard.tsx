import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useNavigate } from "react-router-dom";

const statusLabels: Record<string, string> = {
  active: "Active",
  pending: "Pending payment",
  on_hold: "On hold",
  canceled: "No pass",
};

export default function GlobalDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useEntitlements();

  const status = data?.status ?? "canceled";
  const hasPassAccess = status === "active" || status === "on_hold";
  const currentPass = data?.current_pass;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in">
        <div>
          <h1 className="mb-2 text-3xl font-bold">InsightPilot Dashboard</h1>
          <p className="text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="mb-2 text-3xl font-bold">InsightPilot Dashboard</h1>
        <p className="text-muted-foreground">
          This is your global workspace. From here you can manage tools, billing, and your profile.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card/80 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {hasPassAccess ? "Workspace access unlocked" : "Choose an access pass"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {hasPassAccess
                ? "Your account is ready. Open tools, manage billing, and review subscription activity."
                : "You can use Billing and Profile now. Buy a pass to unlock tools and the rest of the workspace."}
            </p>
          </div>
          <Badge variant={hasPassAccess ? "default" : "secondary"}>
            {statusLabels[status] ?? status}
          </Badge>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/80 px-4 py-4">
            <p className="text-sm text-muted-foreground">Current pass</p>
            <p className="mt-2 text-lg font-semibold">{currentPass?.name ?? "No active pass"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentPass
                ? `${currentPass.tool_limit} tool slot(s)`
                : "Tools stay locked until a payment succeeds."}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 px-4 py-4">
            <p className="text-sm text-muted-foreground">Available now</p>
            <p className="mt-2 text-lg font-semibold">
              {hasPassAccess ? "Tools, Billing, Profile" : "Billing, Profile, locked dashboard"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasPassAccess
                ? "Use Billing to change passes or manage your invoices."
                : "Complete a purchase in Billing, then return here to unlock the platform."}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/dashboard/billing")}>
            {hasPassAccess ? "Manage billing" : "Choose a pass"}
          </Button>
          <Button variant="secondary" onClick={() => navigate("/dashboard/profile")}>
            Open profile
          </Button>
          {hasPassAccess && (
            <Button variant="outline" onClick={() => navigate("/dashboard/tools")}>
              View tools
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
