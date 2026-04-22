export interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'error';
  schedule: string;
  lastRun?: Date;
  nextRun?: Date;
  iconName?: string;
}

export interface Report {
  id: string;
  title: string;
  product: string;
  marketplace: string;
  generatedAt: Date;
  fileUrl?: string;
  summary: string;
  keyStats: {
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
  }[];
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  iconName?: string;
  connectedAt?: Date;
  lastSync?: Date;
}

export interface Activity {
  id: string;
  type: 'trend_alert' | 'price_suggestion' | 'report_generated' | 'automation_run' | 'integration_sync';
  title: string;
  description: string;
  timestamp: Date;
  iconName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface BillingInfo {
  planName: string;
  planTier: 'starter' | 'pro' | 'enterprise';
  price: number;
  billingPeriod: 'monthly' | 'yearly';
  renewalDate: Date;
  status: 'active' | 'past_due' | 'canceled';
  usage: {
    automations: { current: number; limit: number };
    reports: { current: number; limit: number };
    apiCalls: { current: number; limit: number };
  };
}
