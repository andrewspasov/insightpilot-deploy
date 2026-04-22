export interface Tool {
  id: string;
  name: string;
  description: string;
  detailedDescription: string;
  category: 'Automations' | 'AI Assistants' | 'Integrations' | 'Analytics';
  isIncluded: boolean;
  isEnabled?: boolean;
  features: string[];
}

export const mockTools: Tool[] = [
  {
    id: 'tool_trend_monitor',
    name: 'Daily Product Trend Monitoring',
    description: 'Automatically track product trends and market shifts',
    detailedDescription: 'Get real-time insights into product performance, search volume changes, and emerging market trends. Our AI monitors thousands of data points daily to keep you ahead of the competition.',
    category: 'Automations',
    isIncluded: true,
    isEnabled: true,
    features: [
      'Real-time trend detection across all major marketplaces',
      'Automated daily reports delivered to your inbox',
      'Custom alerts for significant market changes',
      'Historical trend analysis and forecasting',
    ],
  },
  {
    id: 'tool_price_optimization',
    name: 'Price Optimization Engine',
    description: 'AI-powered dynamic pricing recommendations',
    detailedDescription: 'Maximize your profits with intelligent pricing strategies. Our engine analyzes competitor prices, demand patterns, and market conditions to suggest optimal price points.',
    category: 'Automations',
    isIncluded: true,
    isEnabled: true,
    features: [
      'Competitor price monitoring in real-time',
      'Dynamic pricing suggestions based on demand',
      'Profit margin optimization algorithms',
      'A/B testing support for price changes',
    ],
  },
  {
    id: 'tool_market_report',
    name: 'Weekly AI Market Report',
    description: 'Comprehensive market analysis and insights',
    detailedDescription: 'Receive detailed weekly reports summarizing market conditions, opportunities, and threats. Perfect for strategic planning and staying informed about your industry.',
    category: 'Automations',
    isIncluded: true,
    isEnabled: false,
    features: [
      'In-depth market analysis with AI insights',
      'Competitor landscape overview',
      'Opportunity identification and recommendations',
      'Customizable report sections and metrics',
    ],
  },
  {
    id: 'tool_ai_assistant',
    name: 'InsightPilot AI Assistant',
    description: 'Chat with AI about your products and market data',
    detailedDescription: 'Ask questions, get insights, and make data-driven decisions faster with our conversational AI assistant trained on your specific market and product data.',
    category: 'AI Assistants',
    isIncluded: true,
    isEnabled: true,
    features: [
      'Natural language queries about your data',
      'Instant answers to market research questions',
      'Product comparison and analysis',
      'Strategic recommendations based on data',
    ],
  },
  {
    id: 'tool_youtube_integration',
    name: 'YouTube Search',
    description: 'Connect to YouTube search insights',
    detailedDescription: 'Monitor YouTube search interest and surface trending videos that match your products or niches.',
    category: 'Integrations',
    isIncluded: true,
    isEnabled: false,
    features: [
      'Trend detection from YouTube search results',
      'Volume and interest indicators',
      'Competitor and content landscape awareness',
      'Ideas for new content angles',
    ],
  },
  {
    id: 'tool_mercadolibre_integration',
    name: 'MercadoLibre Marketplace Connection',
    description: 'Integrate MercadoLibre marketplace data',
    detailedDescription: 'Connect MercadoLibre to analyze marketplace performance, customer behavior, and product metrics in one place.',
    category: 'Integrations',
    isIncluded: true,
    isEnabled: false,
    features: [
      'Complete store data synchronization',
      'Customer behavior analytics',
      'Product performance tracking',
      'Conversion optimization insights',
    ],
  },
  {
    id: 'tool_advanced_analytics',
    name: 'Advanced Analytics Dashboard',
    description: 'Deep dive into your product and market data',
    detailedDescription: 'Unlock powerful analytics capabilities with custom dashboards, advanced filters, and predictive modeling for your products.',
    category: 'Analytics',
    isIncluded: false,
    isEnabled: false,
    features: [
      'Custom dashboard creation',
      'Advanced data visualization',
      'Predictive analytics and forecasting',
      'Export capabilities for presentations',
    ],
  },
  {
    id: 'tool_sentiment_analysis',
    name: 'Customer Sentiment Analysis',
    description: 'AI-powered review and feedback analysis',
    detailedDescription: 'Understand what customers really think with AI-powered sentiment analysis across all your reviews and customer feedback.',
    category: 'AI Assistants',
    isIncluded: false,
    isEnabled: false,
    features: [
      'Automated review sentiment scoring',
      'Trending topics and pain points identification',
      'Competitor sentiment comparison',
      'Actionable improvement recommendations',
    ],
  },
];
