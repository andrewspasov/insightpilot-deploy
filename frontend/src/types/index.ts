export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  planName: string;
  planTier: 'starter' | 'pro' | 'agency';
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  status: 'active' | 'trial' | 'canceled' | 'past_due';
  nextBillingDate: Date;
  cancelAtPeriodEnd: boolean;
}

export interface ToolPurchase {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'expired';
  purchasedAt: Date;
  renewsAt?: Date;
  isLifetime: boolean;
  iconName?: string;
}

export interface BillingEntry {
  id: string;
  date: Date;
  description: string;
  amount: number;
  status: 'paid' | 'failed' | 'refunded' | 'pending';
  invoiceUrl?: string;
}
