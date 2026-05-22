import { useState, ReactNode } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import {
  Apple,
  ClipboardList,
  Lightbulb,
  FileText,
  Sparkles,
  ArrowLeft,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useToolAccess } from "@/hooks/use-entitlements";

interface NutritionLayoutProps {
  children: ReactNode;
}

const nutritionMenuItems = [
  { label: "Overview", path: "/tools/nutrition", icon: Apple },
  { label: "Logs", path: "/tools/nutrition/logs", icon: ClipboardList },
  { label: "Insights", path: "/tools/nutrition/insights", icon: Lightbulb },
  { label: "Reports", path: "/tools/nutrition/reports", icon: FileText },
  { label: "InsightPilot AI", path: "/tools/nutrition/ai", icon: Sparkles },
  { label: "Back to InsightPilot Home", path: "/dashboard", icon: ArrowLeft },
];

export function NutritionLayout({ children }: NutritionLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const { isReadOnly } = useToolAccess("nutrition");

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
        {sidebarOpen ? <ArrowLeft size={24} /> : <Apple size={24} />}
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
          <div
            className={cn(
              "flex h-16 items-center border-b border-border px-6 justify-between",
              sidebarCollapsed && "px-3",
            )}
          >
            <div className={cn("flex items-center gap-2", sidebarCollapsed && "justify-center gap-0")}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Apple className="h-5 w-5 text-primary-foreground" />
              </div>
              {!sidebarCollapsed && (
                <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Nutrition
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="ml-2" asChild>
                <NavLink to="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                </NavLink>
              </Button>
            </div>
          </div>

          <nav className={cn("flex-1 space-y-1 px-3 py-4", sidebarCollapsed && "px-2")}>
            {nutritionMenuItems.map((item) => (
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

          <div className="border-t border-border p-4">
            <Button
              variant="outline"
              className={cn("w-full mb-3 justify-center", sidebarCollapsed && "px-0")}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && <span className="ml-2">Log out</span>}
            </Button>
            <div className={cn("flex items-center justify-center", sidebarCollapsed && "justify-center")}>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8 lg:px-8">
          {isReadOnly && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Your subscription is in a grace period. Nutrition is read-only right now.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
