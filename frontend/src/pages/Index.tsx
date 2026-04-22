import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { ParallaxSection } from "@/components/ParallaxSection";
import { LogoCarousel } from "@/components/LogoCarousel";
import { GrowingStats } from "@/components/GrowingStats";
import { CTA } from "@/components/CTA";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BLOG_URL } from "@/lib/env";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Menu, X } from "lucide-react";

const Index = () => {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const [leftVisible, setLeftVisible] = useState(false);
  const [rightVisible, setRightVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === leftRef.current && entry.isIntersecting) {
            setLeftVisible(true);
          }
          if (entry.target === rightRef.current && entry.isIntersecting) {
            setRightVisible(true);
          }
        });
      },
      { threshold: 0.25 },
    );

    if (leftRef.current) observer.observe(leftRef.current);
    if (rightRef.current) observer.observe(rightRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 w-full overflow-hidden backdrop-blur-lg">
        <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-80" />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-lg font-semibold">
            InsightPilot
          </Link>
          <div className="hidden md:block">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link to="/" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-foreground/5">
                      Home
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/dashboard"
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-foreground/5"
                    >
                      Dashboard
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/automations"
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-foreground/5"
                    >
                      Automations
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/login"
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-foreground/5"
                    >
                      Login
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      to="/signup"
                      className="rounded-md px-3 py-2 text-sm font-medium hover:bg-foreground/5"
                    >
                      Sign up
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <button
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-white/10 md:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span>Menu</span>
          </button>
        </div>
        <div
          className={cn(
            "mx-auto mt-2 w-full max-w-6xl px-6 pb-3 md:hidden",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div className="rounded-2xl border border-white/10 bg-card/90 p-4 shadow-lg backdrop-blur transition">
            <div className="flex flex-col gap-2 text-sm font-semibold text-foreground">
              <Link className="rounded-lg px-3 py-2 hover:bg-foreground/5" to="/" onClick={() => setMobileOpen(false)}>
                Home
              </Link>
              <Link
                className="rounded-lg px-3 py-2 hover:bg-foreground/5"
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                className="rounded-lg px-3 py-2 hover:bg-foreground/5"
                to="/automations"
                onClick={() => setMobileOpen(false)}
              >
                Automations
              </Link>
              <Link
                className="rounded-lg px-3 py-2 hover:bg-foreground/5"
                to="/login"
                onClick={() => setMobileOpen(false)}
              >
                Login
              </Link>
              <Link
                className="rounded-lg px-3 py-2 hover:bg-foreground/5"
                to="/signup"
                onClick={() => setMobileOpen(false)}
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </header>
      <Hero />
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-hero animate-gradient opacity-20" />
        <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-2 md:items-center">
          <div
            ref={leftRef}
            className={cn("space-y-7 swoop-left", leftVisible && "in-view")}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/80">
              Live Preview
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
            </div>
            <h2 className="text-3xl font-bold leading-tight md:text-4xl">
              Launch automations in minutes with a guided setup
            </h2>
            <p className="text-lg text-muted-foreground">
              Orchestrate triggers, actions, and notifications while keeping your team in the loop. Everything updates in
              real time as you adjust the plan.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Trigger</p>
                <p className="mt-2 text-lg font-semibold">New lead created</p>
                <p className="text-sm text-muted-foreground">Pulls from CRM and enriches automatically.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_20px_60px_-10px_rgba(86,173,255,0.45)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Action</p>
                <p className="mt-2 text-lg font-semibold">Notify sales squad</p>
                <p className="text-sm text-muted-foreground">Assign owner, post to Slack, and schedule follow-up.</p>
              </div>
            </div>
          </div>
          <div
            ref={rightRef}
            className={cn("relative swoop-right", rightVisible && "in-view")}
          >
            <div className="absolute -left-8 -top-6 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-8 -right-6 h-28 w-28 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative rounded-2xl border border-white/10 bg-card/70 p-6 shadow-strong backdrop-blur transition duration-500 ease-out hover:scale-105 hover:border-white/20 hover:shadow-[0_24px_80px_-12px_rgba(86,173,255,0.55)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Try the flow designer</h3>
                <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground/80">
                  Beta
                </span>
              </div>
              <form className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Workflow name</label>
                  <Input placeholder="e.g. Qualify inbound leads" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Primary channel</label>
                  <Input placeholder="Slack, Email, SMS..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">What should happen?</label>
                  <Textarea rows={4} placeholder="Describe the steps and we'll draft the automation for you." />
                </div>
                <Button className="w-full" size="lg">
                  Generate draft
                </Button>
              </form>
              <p className="mt-4 text-xs text-muted-foreground">
                Your draft is private. We never send your data to third-party models.
              </p>
            </div>
          </div>
        </div>
      </section>
      <Features />
      <ParallaxSection />
      <LogoCarousel />
      <GrowingStats />
      <CTA />
      <footer className="mt-24 border-t border-white/10 bg-gradient-to-b from-background to-foreground/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-14 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
                <span className="text-sm font-bold text-primary-foreground">IP</span>
              </div>
              <div>
                <p className="text-lg font-semibold">InsightPilot</p>
                <p className="text-xs text-muted-foreground">AI-first workspace for automation tools</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Launch, monitor, and refine AI automations with human-friendly controls. Built for teams that move fast.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/dashboard" className="rounded-full bg-foreground/10 px-4 py-2 text-xs font-semibold hover:bg-foreground/15 transition">
                Go to dashboard
              </Link>
              <Link to="/signup" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-strong hover:shadow-glow transition">
                Start free
              </Link>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-10 md:grid-cols-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Product</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <Link to="/dashboard/tools" className="block hover:text-foreground">Tools overview</Link>
                <Link to="/tools/ntr" className="block hover:text-foreground">NicheTrendRadar</Link>
                <Link to="/dashboard" className="block hover:text-foreground">Global workspace</Link>
                <a href="#features" className="block hover:text-foreground">Feature highlights</a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Company</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <Link to="/about" className="block hover:text-foreground">About</Link>
                <a href={BLOG_URL} className="block hover:text-foreground">Blog</a>
                <a href="#" className="block hover:text-foreground">Careers</a>
                <a href="#" className="block hover:text-foreground">Press</a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Resources</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="#" className="block hover:text-foreground">Docs</a>
                <a href="#" className="block hover:text-foreground">API</a>
                <a href="#" className="block hover:text-foreground">Status</a>
                <a href="#" className="block hover:text-foreground">Community</a>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Support</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="#" className="block hover:text-foreground">Help center</a>
                <a href="#" className="block hover:text-foreground">Security</a>
                <Link to="/privacy" className="block hover:text-foreground">Privacy</Link>
                <a href="#" className="block hover:text-foreground">Terms</a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <p>© {currentYear} InsightPilot. All rights reserved.</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
              <a href="#" className="hover:text-foreground">Terms</a>
              <a href="#" className="hover:text-foreground">Status</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
