import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useToolAccess } from "@/hooks/use-entitlements";

interface ToolAccessGuardProps {
  toolKey: string;
  children: ReactNode;
}

export default function ToolAccessGuard({ toolKey, children }: ToolAccessGuardProps) {
  const location = useLocation();
  const { isLoading, hasAccess } = useToolAccess(toolKey);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking subscription...
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <Navigate
        to="/dashboard/tools"
        replace
        state={{ from: location, reason: "locked", tool: toolKey }}
      />
    );
  }

  return <>{children}</>;
}
