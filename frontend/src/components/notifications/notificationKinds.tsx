import { AlertTriangle, Bell, CreditCard, FileText, Grid3X3, PartyPopper, ShieldCheck, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Icon and colour per notification kind.
export const NOTIFICATION_KINDS: Record<string, { icon: LucideIcon; tone: string }> = {
  welcome: { icon: PartyPopper, tone: "text-primary bg-primary/15" },
  security: { icon: ShieldCheck, tone: "text-amber-400 bg-amber-400/15" },
  payment: { icon: CreditCard, tone: "text-emerald-400 bg-emerald-400/15" },
  payment_failed: { icon: AlertTriangle, tone: "text-destructive bg-destructive/15" },
  pass: { icon: Ticket, tone: "text-violet-400 bg-violet-400/15" },
  tools: { icon: Grid3X3, tone: "text-primary bg-primary/15" },
  report: { icon: FileText, tone: "text-sky-400 bg-sky-400/15" },
};

export const kindStyle = (kind: string) => NOTIFICATION_KINDS[kind] ?? { icon: Bell, tone: "text-muted-foreground bg-muted" };
