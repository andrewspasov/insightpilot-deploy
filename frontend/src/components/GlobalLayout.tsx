// frontend/src/components/GlobalLayout.tsx

import { ReactNode, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Grid3X3,
  CreditCard,
  Bell,
  User,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useEntitlements } from "@/hooks/use-entitlements";

type GlobalLayoutProps = {
  children: ReactNode; // whatever page we show inside the layout
};

const globalMenuItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Tools", path: "/dashboard/tools", icon: Grid3X3 },
  { label: "Billing", path: "/dashboard/billing", icon: CreditCard },
  { label: "Notifications", path: "/dashboard/notifications", icon: Bell },
  { label: "Profile", path: "/dashboard/profile", icon: User },
  { label: "Settings", path: "/dashboard/settings", icon: Settings },
];

export function GlobalLayout({ children }: GlobalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const { data } = useEntitlements();

  const hasPassAccess = data?.status === "active" || data?.status === "on_hold";
  const visibleMenuItems = data
    ? hasPassAccess
      ? globalMenuItems
      : globalMenuItems.filter((item) =>
          ["/dashboard", "/dashboard/billing", "/dashboard/profile"].includes(item.path),
        )
    : globalMenuItems;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 lg:hidden"
        onClick={() => setSidebarOpen((open) => !open)}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-card border-r border-border transition-transform duration-300 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          sidebarCollapsed ? "lg:w-16" : "lg:w-64",
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div
            className={cn(
              "flex h-16 items-center border-b border-border px-6",
              sidebarCollapsed && "justify-center px-3",
            )}
          >
            <div className={cn("flex items-center gap-2", sidebarCollapsed && "gap-0")}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <span className="text-sm font-bold text-primary-foreground">
                  IP
                </span>
              </div>
              {!sidebarCollapsed && (
                <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  InsightPilot
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto hidden lg:inline-flex"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className={cn("flex-1 space-y-1 px-3 py-4", sidebarCollapsed && "px-2")}>
            {visibleMenuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
                  sidebarCollapsed && "justify-center gap-0 px-2",
                )}
                activeClassName="bg-muted text-foreground"
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                {!sidebarCollapsed && item.label}
              </NavLink>
            ))}
          </nav>

          {/* User + theme section */}
          <div className="border-t border-border p-4">
            <Button
              variant="outline"
              className={cn("w-full mb-3 justify-center", sidebarCollapsed && "px-0")}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && <span className="ml-2">Log out</span>}
            </Button>
            <div className={cn("flex items-center justify-center mb-3", sidebarCollapsed && "justify-center")}>
              <ThemeToggle />
            </div>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors cursor-pointer">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">
                    U
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">Your account</p>
                  <p className="text-xs text-muted-foreground truncate">
                    InsightPilot workspace
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
