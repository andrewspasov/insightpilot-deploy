import { useState, ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  User,
  Settings,
  Sparkles,
  Menu,
  X,
  Zap,
  FileText,
  MessageSquare,
  CreditCard,
  Plug,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';

interface DashboardLayoutProps {
  children: ReactNode;
}

const menuItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Automations', path: '/dashboard/automations', icon: Zap },
  { label: 'Reports', path: '/dashboard/reports', icon: FileText },
  { label: 'AI Assistant', path: '/dashboard/ai-assistant', icon: MessageSquare },
  { label: 'Tools', path: '/dashboard/tools', icon: Sparkles },
  { label: 'Integrations', path: '/dashboard/integrations', icon: Plug },
  { label: 'Billing', path: '/dashboard/billing', icon: CreditCard },
  { label: 'Notifications', path: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', path: '/dashboard/profile', icon: User },
  { label: 'Settings', path: '/dashboard/settings', icon: Settings },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform bg-card border-r border-border transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-border px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                InsightPilot
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                activeClassName="bg-muted text-foreground"
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-border p-4">
            <div className="flex items-center justify-center mb-3">
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors cursor-pointer">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Sarah Johnson</p>
                <p className="text-xs text-muted-foreground truncate">Pro Plan</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
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
