import { Automation, Report, Integration, Activity, BillingInfo } from '@/types/dashboard';

export const mockAutomations: Automation[] = [
  {
    id: 'auto_1',
    name: 'Daily Product Trends',
    description: 'Automatically analyze product trends and send daily insights',
    status: 'active',
    schedule: 'Daily at 9:00 AM',
    lastRun: new Date('2024-11-20T09:00:00'),
    nextRun: new Date('2024-11-21T09:00:00'),
    iconName: 'TrendingUp',
  },
  {
    id: 'auto_2',
    name: 'Price Optimization Engine',
    description: 'Monitor competitor prices and suggest optimal pricing',
    status: 'active',
    schedule: 'Every 6 hours',
    lastRun: new Date('2024-11-20T15:00:00'),
    nextRun: new Date('2024-11-20T21:00:00'),
    iconName: 'DollarSign',
  },
  {
    id: 'auto_3',
    name: 'Weekly AI Market Reports',
    description: 'Generate comprehensive market analysis reports',
    status: 'paused',
    schedule: 'Every Monday at 8:00 AM',
    lastRun: new Date('2024-11-18T08:00:00'),
    nextRun: new Date('2024-11-25T08:00:00'),
    iconName: 'FileText',
  },
];

export const mockReports: Report[] = [
  {
    id: 'report_1',
    title: 'Q4 2024 Market Analysis',
    product: 'Smart Home Devices',
    marketplace: 'YouTube',
    generatedAt: new Date('2024-11-15'),
    summary: 'Smart home device sales increased 23% QoQ with voice assistants leading growth. Holiday season projections show strong demand.',
    keyStats: [
      { label: 'Sales Growth', value: '+23%', trend: 'up' },
      { label: 'Avg. Price', value: '$89.99', trend: 'down' },
      { label: 'Market Share', value: '34%', trend: 'up' },
      { label: 'Reviews', value: '4.5★', trend: 'up' },
    ],
  },
  {
    id: 'report_2',
    title: 'Competitor Price Analysis',
    product: 'Wireless Earbuds',
    marketplace: 'MercadoLibre',
    generatedAt: new Date('2024-11-18'),
    summary: 'Competitor pricing shows downward trend. Recommend price adjustment to maintain competitive position while preserving margins.',
    keyStats: [
      { label: 'Avg. Competitor Price', value: '$79.99', trend: 'down' },
      { label: 'Your Price', value: '$89.99', trend: 'neutral' },
      { label: 'Price Gap', value: '+12.5%', trend: 'down' },
      { label: 'Conversion Rate', value: '3.2%', trend: 'down' },
    ],
  },
  {
    id: 'report_3',
    title: 'Trend Detection Report',
    product: 'Fitness Trackers',
    marketplace: 'YouTube',
    generatedAt: new Date('2024-11-20'),
    summary: 'Emerging trend: Sleep tracking features gaining popularity. Products with advanced sleep metrics showing 45% higher engagement.',
    keyStats: [
      { label: 'Search Volume', value: '+45%', trend: 'up' },
      { label: 'Interest Score', value: '87/100', trend: 'up' },
      { label: 'Competition', value: 'Medium', trend: 'neutral' },
      { label: 'Opportunity', value: 'High', trend: 'up' },
    ],
  },
];

export const mockIntegrations: Integration[] = [
  {
    id: 'int_1',
    name: 'YouTube Search',
    description: 'Connect to YouTube to monitor search trends for your products',
    status: 'connected',
    iconName: 'ShoppingBag',
    connectedAt: new Date('2024-09-15'),
    lastSync: new Date('2024-11-20T16:30:00'),
  },
  {
    id: 'int_2',
    name: 'MercadoLibre',
    description: 'Integrate with MercadoLibre to analyze your store performance',
    status: 'connected',
    iconName: 'Store',
    connectedAt: new Date('2024-10-01'),
    lastSync: new Date('2024-11-20T14:00:00'),
  },
  {
    id: 'int_3',
    name: 'WooCommerce',
    description: 'Connect WooCommerce for product and order insights',
    status: 'disconnected',
    iconName: 'ShoppingCart',
  },
  {
    id: 'int_4',
    name: 'Google Analytics',
    description: 'Track website traffic and user behavior',
    status: 'disconnected',
    iconName: 'BarChart',
  },
];

export const mockActivities: Activity[] = [
  {
    id: 'act_1',
    type: 'trend_alert',
    title: 'New Trend Detected',
    description: 'Sleep tracking features trending +45% in fitness tracker category',
    timestamp: new Date('2024-11-20T10:30:00'),
    iconName: 'TrendingUp',
  },
  {
    id: 'act_2',
    type: 'price_suggestion',
    title: 'Price Optimization Suggestion',
    description: 'Wireless Earbuds: Consider reducing price by 10% to match competitor average',
    timestamp: new Date('2024-11-20T09:15:00'),
    iconName: 'DollarSign',
  },
  {
    id: 'act_3',
    type: 'report_generated',
    title: 'Report Generated',
    description: 'Q4 2024 Market Analysis for Smart Home Devices is ready',
    timestamp: new Date('2024-11-20T08:00:00'),
    iconName: 'FileText',
  },
  {
    id: 'act_4',
    type: 'automation_run',
    title: 'Automation Completed',
    description: 'Daily Product Trends automation finished successfully',
    timestamp: new Date('2024-11-20T09:00:00'),
    iconName: 'Zap',
  },
  {
    id: 'act_5',
    type: 'integration_sync',
    title: 'Integration Synced',
    description: 'YouTube search data updated successfully',
    timestamp: new Date('2024-11-20T16:30:00'),
    iconName: 'RefreshCw',
  },
];

export const mockBillingInfo: BillingInfo = {
  planName: 'Pro Plan',
  planTier: 'pro',
  price: 99,
  billingPeriod: 'monthly',
  renewalDate: new Date('2024-12-20'),
  status: 'active',
  usage: {
    automations: { current: 3, limit: 10 },
    reports: { current: 12, limit: 50 },
    apiCalls: { current: 8450, limit: 25000 },
  },
};
