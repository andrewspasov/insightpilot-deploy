export type InsightAIRole = "user" | "assistant";

export type InsightAIMessage = {
  id: string;
  role: InsightAIRole;
  content: string;
  timestamp: Date;
};

export type InsightAIStatus = {
  configured: boolean;
  provider: string;
  model: string;
  nutrition_access: boolean;
  private_access: boolean;
  can_chat: boolean;
  limits: {
    monthly_messages: number;
    monthly_tokens: number;
  };
  usage: {
    messages: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type InsightAIHistoryMessage = {
  role: InsightAIRole;
  content: string;
};

export type InsightAIChatRequest = {
  message: string;
  history: InsightAIHistoryMessage[];
};

export type InsightAIChatResponse = {
  reply: string;
  provider: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  monthly_usage: InsightAIStatus["usage"];
};
