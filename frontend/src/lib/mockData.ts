import { User, Subscription, ToolPurchase, BillingEntry } from '@/types';

export const mockUser: User = {
  id: '1',
  email: 'sarah.johnson@example.com',
  fullName: 'Sarah Johnson',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
  createdAt: new Date('2024-01-15'),
};

export const mockSubscription: Subscription = {
  id: 'sub_1',
  planName: 'Pro Plan',
  planTier: 'pro',
  billingPeriod: 'monthly',
  price: 49,
  status: 'active',
  nextBillingDate: new Date('2025-12-20'),
  cancelAtPeriodEnd: false,
};

export const mockToolPurchases: ToolPurchase[] = [
  {
    id: 'tool_1',
    name: 'AI Content Generator',
    description: 'Generate high-quality content using advanced AI models',
    status: 'active',
    purchasedAt: new Date('2024-03-10'),
    renewsAt: new Date('2025-12-20'),
    isLifetime: false,
    iconName: 'Sparkles',
  },
  {
    id: 'tool_2',
    name: 'Data Analytics Dashboard',
    description: 'Visualize and analyze your data with powerful charts',
    status: 'active',
    purchasedAt: new Date('2024-05-20'),
    isLifetime: true,
    iconName: 'BarChart3',
  },
  {
    id: 'tool_3',
    name: 'Email Automation Suite',
    description: 'Automate your email campaigns and follow-ups',
    status: 'active',
    purchasedAt: new Date('2024-08-15'),
    renewsAt: new Date('2025-12-20'),
    isLifetime: false,
    iconName: 'Mail',
  },
  {
    id: 'tool_4',
    name: 'Social Media Scheduler',
    description: 'Schedule and manage posts across all platforms',
    status: 'paused',
    purchasedAt: new Date('2024-02-01'),
    renewsAt: new Date('2025-12-20'),
    isLifetime: false,
    iconName: 'Calendar',
  },
];

export const mockBillingHistory: BillingEntry[] = [
  {
    id: 'bill_1',
    date: new Date('2024-11-20'),
    description: 'Pro Plan - Monthly',
    amount: 49,
    status: 'paid',
    invoiceUrl: '#',
  },
  {
    id: 'bill_2',
    date: new Date('2024-10-20'),
    description: 'Pro Plan - Monthly',
    amount: 49,
    status: 'paid',
    invoiceUrl: '#',
  },
  {
    id: 'bill_3',
    date: new Date('2024-09-20'),
    description: 'Pro Plan - Monthly',
    amount: 49,
    status: 'paid',
    invoiceUrl: '#',
  },
  {
    id: 'bill_4',
    date: new Date('2024-08-15'),
    description: 'Email Automation Suite',
    amount: 29,
    status: 'paid',
    invoiceUrl: '#',
  },
  {
    id: 'bill_5',
    date: new Date('2024-05-20'),
    description: 'Data Analytics Dashboard - Lifetime',
    amount: 199,
    status: 'paid',
    invoiceUrl: '#',
  },
];
