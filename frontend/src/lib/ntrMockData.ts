import {
  NtrTrack,
  NtrTrendSnapshot,
  NtrTrendReport,
  NtrActivityItem,
  NtrIntegrationSource,
  SubscriptionPlanSummary,
  ToolSummary,
  NtrChatMessage,
} from '@/types/ntr';

// Mock Tracks
export const mockTracks: NtrTrack[] = [
  {
    id: 'track-1',
    name: 'Standing Desks in EU',
    keywords: ['standing desk', 'sit stand desk', 'adjustable desk'],
    marketRegion: 'EU',
    category: 'ecommerce',
    status: 'active',
    frequency: 'daily',
    platform: 'youtube',
    country: 'US',
    language: 'en',
    lastRunAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60 * 23).toISOString(),
  },
  {
    id: 'track-2',
    name: 'Home Gym Equipment',
    keywords: ['home gym', 'workout equipment', 'fitness gear'],
    marketRegion: 'US',
    category: 'ecommerce',
    status: 'active',
    frequency: 'weekly',
    platform: 'mercadolibre',
    country: 'US',
    language: 'en',
    lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'track-3',
    name: 'AI Copywriting Tools',
    keywords: ['AI copywriting', 'content generation', 'GPT writing'],
    marketRegion: 'Global',
    category: 'SaaS',
    status: 'active',
    frequency: 'daily',
    platform: 'youtube',
    country: '',
    language: 'en',
    lastRunAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    nextRunAt: new Date(Date.now() + 1000 * 60 * 60 * 23.5).toISOString(),
  },
  {
    id: 'track-4',
    name: 'Sustainable Packaging',
    keywords: ['eco packaging', 'sustainable materials', 'green packaging'],
    marketRegion: 'EU',
    category: 'ecommerce',
    status: 'paused',
    frequency: 'weekly',
    platform: 'mercadolibre',
    country: 'EU',
    language: 'en',
    lastRunAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
];

// Mock Snapshots
export const mockSnapshots: NtrTrendSnapshot[] = [
  {
    id: 'snap-1',
    trackId: 'track-1',
    runAt: new Date().toISOString(),
    platform: 'youtube',
    source: 'mock',
    metrics: {
      searchVolume: 780,
      mentionCount: 1247,
      priceIndex: 60,
      sentimentScore: 0.42,
    },
    summary: 'Search volume up 22% week over week; increased mentions in forums.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'snap-2',
    trackId: 'track-2',
    runAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    platform: 'mercadolibre',
    source: 'mock',
    metrics: {
      searchVolume: 620,
      mentionCount: 893,
      priceIndex: 48,
      sentimentScore: -0.12,
    },
    summary: 'Search interest declined 8% from last week; price competition intensifying.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'snap-3',
    trackId: 'track-3',
    runAt: new Date().toISOString(),
    platform: 'youtube',
    source: 'mock',
    metrics: {
      searchVolume: 910,
      mentionCount: 2341,
      priceIndex: 72,
      sentimentScore: 0.63,
    },
    summary: 'Massive surge in search volume (+45%); viral posts driving awareness.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Mock Reports
export const mockReports: NtrTrendReport[] = [
  {
    id: 'report-1',
    trackId: 'track-1',
    title: 'Standing Desks EU - Weekly Trend Report',
    periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    periodEnd: new Date().toISOString(),
    summary:
      'Standing desks in the EU market show strong upward momentum with a 22% increase in search interest. Consumer focus is shifting toward premium ergonomic features and sustainability certifications. Price sensitivity remains moderate in the €400-600 range.',
    highlights: [
      'Search volume increased 22% week over week',
      'Strong interest in premium ergonomic models',
      'Sustainability certifications becoming key differentiator',
      'Social media engagement up 35%',
    ],
    risks: [
      'Increased competition from new entrants',
      'Supply chain concerns in Eastern Europe',
      'Price pressure from budget alternatives',
    ],
  },
  {
    id: 'report-2',
    trackId: 'track-3',
    title: 'AI Copywriting Tools - Market Surge Analysis',
    periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    periodEnd: new Date().toISOString(),
    summary:
      'AI copywriting tools experienced explosive growth this week with a 45% surge in search volume. Multiple new product launches and viral social media content drove awareness. Market is rapidly maturing with clear segmentation emerging.',
    highlights: [
      'Search interest increased 45% - highest on record',
      'Three major product launches this week',
      'Enterprise adoption accelerating',
      'Integration features becoming standard',
    ],
    risks: [
      'Market saturation concerns',
      'Quality differentiation becoming harder',
      'Regulatory scrutiny increasing',
    ],
  },
  {
    id: 'report-3',
    trackId: 'track-2',
    title: 'Home Gym Equipment - Competitive Pressure Report',
    periodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    periodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    summary:
      'Home gym equipment market facing headwinds with declining search interest and increased price competition. New competitor entry intensifying pressure on margins. Market shows signs of maturation after pandemic boom.',
    highlights: [
      'Compact equipment segment showing resilience',
      'Smart features driving premium sales',
    ],
    risks: [
      'Overall search volume down 8%',
      'Price wars eroding margins',
      'Return to gym memberships affecting demand',
      'Oversupply in certain categories',
    ],
  },
];

// Mock Activity
export const mockActivity: NtrActivityItem[] = [
  {
    id: 'act-1',
    type: 'new_trend_detected',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    trackId: 'track-1',
    severity: 'info',
    message: 'Standing Desks in EU: Major upward trend detected (+22% interest)',
  },
  {
    id: 'act-2',
    type: 'snapshot_created',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    trackId: 'track-1',
    severity: 'info',
    message: 'Daily snapshot completed for Standing Desks in EU',
  },
  {
    id: 'act-3',
    type: 'report_generated',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    trackId: 'track-3',
    severity: 'info',
    message: 'Weekly report generated: AI Copywriting Tools - Market Surge Analysis',
  },
  {
    id: 'act-4',
    type: 'integration_issue',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    severity: 'warning',
    message: 'Reddit API rate limit reached. Next sync in 2 hours.',
  },
  {
    id: 'act-5',
    type: 'track_created',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    trackId: 'track-3',
    severity: 'info',
    message: 'New track created: AI Copywriting Tools',
  },
  {
    id: 'act-6',
    type: 'track_paused',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    trackId: 'track-4',
    severity: 'info',
    message: 'Track paused: Sustainable Packaging',
  },
];

// Mock Integration Sources
export const mockIntegrationSources: NtrIntegrationSource[] = [
  {
    id: 'int-1',
    name: 'Google Trends',
    description: 'Real-time search interest data and trending topics',
    status: 'connected',
  },
  {
    id: 'int-2',
    name: 'News API',
    description: 'News articles and media coverage monitoring',
    status: 'connected',
  },
  {
    id: 'int-3',
    name: 'Reddit',
    description: 'Community discussions and sentiment analysis',
    status: 'not_connected',
  },
  {
    id: 'int-4',
    name: 'Twitter / X',
    description: 'Social media trends and real-time conversations',
    status: 'not_connected',
  },
  {
    id: 'int-5',
    name: 'YouTube Trends',
    description: 'Search and content trend signals from YouTube',
    status: 'error',
  },
  {
    id: 'int-6',
    name: 'MercadoLibre Trends',
    description: 'Ecommerce platform trend insights',
    status: 'not_connected',
  },
];

// Mock Subscription
export const mockSubscription: SubscriptionPlanSummary = {
  name: 'Pro',
  maxToolsAllowed: 3,
  billingInterval: 'monthly',
  status: 'active',
  currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 23).toISOString(),
};

// Mock Tools
export const mockTools: ToolSummary[] = [
  {
    id: 'tool-1',
    name: 'NicheTrendRadar',
    slug: 'niche-trend-radar',
    description: 'AI-powered niche and trend monitoring for your products and markets',
    status: 'active',
  },
  {
    id: 'tool-2',
    name: 'CompetitorWatch',
    slug: 'competitor-watch',
    description: 'Track competitor pricing, positioning, and market moves',
    status: 'available',
    requiresPlanLevel: 'Pro',
  },
  {
    id: 'tool-3',
    name: 'ContentOptimizer',
    slug: 'content-optimizer',
    description: 'AI-driven content analysis and SEO recommendations',
    status: 'locked',
    requiresPlanLevel: 'Business',
  },
];

// Mock Chat Messages
export const mockChatMessages: NtrChatMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content:
      "Hello! I'm your NicheTrendRadar AI Assistant. I can help you analyze trends, understand market shifts, and get insights from your tracked niches. What would you like to know?",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'msg-2',
    role: 'user',
    content: 'Which of my tracks changed the most in the last 7 days?',
    timestamp: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content:
      "Based on your tracked niches, **AI Copywriting Tools** showed the most significant change with a +45% surge in search interest. This is the highest increase on record for this track.\n\n**Standing Desks in EU** also performed strongly with a +22% increase in search volume.\n\nOn the other hand, **Home Gym Equipment** declined by 8%, facing competitive pressure and market maturation.\n\nWould you like me to dive deeper into any of these trends?",
    timestamp: new Date(Date.now() - 1000 * 60 * 58).toISOString(),
  },
];
