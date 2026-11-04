export type InsightAIRole = "user" | "assistant";

export type InsightAIMessage = {
  id: string;
  role: InsightAIRole;
  content: string;
  timestamp: Date;
  pendingAction?: InsightAIAction | null;
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

export type InsightAIAction = {
  id: number;
  action_type: string;
  status: "pending" | "confirmed" | "cancelled" | "expired" | "failed";
  summary: string;
  payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  error_message: string;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
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
  pending_action: InsightAIAction | null;
  monthly_usage: InsightAIStatus["usage"];
};

export type InsightAIActionResponse = {
  action: InsightAIAction;
};

export type InsightAILoggingStatus = {
  reminders_enabled: boolean;
  last_logged_date: string | null;
  days_since_last_log: number;
  show_nudge: boolean;
  title: string;
  message: string;
};
