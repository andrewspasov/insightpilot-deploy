import { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { useEntitlements } from "@/hooks/use-entitlements";

interface RequirePassAccessProps {
  children: ReactNode;
  redirectTo?: string;
}

export default function RequirePassAccess({
  children,
  redirectTo = "/dashboard/billing",
}: RequirePassAccessProps) {
  const location = useLocation();
  const { data, isLoading, error } = useEntitlements();

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking subscription...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-xl font-semibold">Could not verify access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not confirm your subscription status. Retry from Billing.
        </p>
        <Link
          to="/dashboard/billing"
          className="mt-4 inline-flex text-sm font-semibold underline"
        >
          Open Billing
        </Link>
      </div>
    );
  }

  const hasPassAccess = data?.status === "active" || data?.status === "on_hold";
  if (!hasPassAccess) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ from: location, reason: "pass_required" }}
      />
    );
  }

  return <>{children}</>;
}
