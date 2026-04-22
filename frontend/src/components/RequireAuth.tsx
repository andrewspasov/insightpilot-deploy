import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";

// We accept children, which is the page we want to protect
type RequireAuthProps = {
  children: ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation(); // We use this to remember where the user tried to go

  // If the user is NOT logged in
  if (!isAuthenticated()) {
    // Redirect them to /login
    // "state" lets us remember the original page they wanted
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the user IS logged in, show the protected page
  return (
    <>
      <IdleSessionGuard />
      {children}
    </>
  );
}

function IdleSessionGuard() {
  useIdleLogout();
  return null;
}
