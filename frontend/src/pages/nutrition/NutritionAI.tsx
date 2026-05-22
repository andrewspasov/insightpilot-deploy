import { useState } from "react";
import { AlertTriangle, Bot, Lock, Send, Sparkles, User } from "lucide-react";

import { useInsightAIChat, useInsightAIStatus } from "@/hooks/use-insight-ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InsightAIHistoryMessage, InsightAIMessage, InsightAIStatus } from "@/types/insight-ai";

const starterMessages: InsightAIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "I am InsightPilot AI. Ask me about your nutrition logs, macros, targets, or recent trends.",
    timestamp: new Date(),
  },
];

const suggestedPrompts = [
  "How am I doing against today's targets?",
  "What should I eat next to hit protein?",
  "Summarize my last 7 days.",
  "What is one simple improvement for tomorrow?",
];

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function usagePercent(current: number, limit: number) {
  if (!limit) {
    return 0;
  }
  return Math.min(100, Math.round((current / limit) * 100));
}

function formatProviderName(provider: string | undefined) {
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "gemini") {
    return "Gemini";
  }
  return "AI provider";
}

function accessMessage(statusData: InsightAIStatus | undefined) {
  if (!statusData) {
    return "Checking InsightPilot AI access...";
  }
  if (!statusData.configured) {
    return `Backend is missing the ${formatProviderName(statusData.provider)} API key.`;
  }
  if (!statusData.nutrition_access) {
    return "Your account needs Nutrition access before using InsightPilot AI.";
  }
  if (!statusData.private_access) {
    return "This private AI test is limited to the allowlisted user.";
  }
  return "Ready for private testing.";
}

function ChatBubble({ message }: { message: InsightAIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("max-w-[78%]", isUser && "text-right")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm whitespace-pre-wrap",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted",
          )}
        >
          {message.content}
        </div>
        <div className="mt-1 px-1 text-xs text-muted-foreground">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}

export default function NutritionAI() {
  const [messages, setMessages] = useState<InsightAIMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const statusQuery = useInsightAIStatus();
  const chatMutation = useInsightAIChat();
  const statusData = statusQuery.data;
  const canChat = Boolean(statusData?.can_chat) && !chatMutation.isPending;

  const sendMessage = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || !statusData?.can_chat || chatMutation.isPending) {
      return;
    }

    const history: InsightAIHistoryMessage[] = messages
      .filter((message) => message.id !== "welcome")
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const userMessage: InsightAIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");

    try {
      const response = await chatMutation.mutateAsync({ message: text, history });
      const assistantMessage: InsightAIMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date(),
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "InsightPilot AI failed to respond.";
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: message,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const messageUsage = statusData
    ? usagePercent(statusData.usage.messages, statusData.limits.monthly_messages)
    : 0;
  const tokenUsage = statusData
    ? usagePercent(statusData.usage.total_tokens, statusData.limits.monthly_tokens)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">InsightPilot AI</h1>
            <p className="text-muted-foreground">
              Private nutrition AI test powered by your logged meals, targets, and recent trends.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[680px] flex-col overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>Nutrition Chat</CardTitle>
            <CardDescription>
              Ask questions. The AI can read nutrition context, but it cannot change your data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-4 w-4 animate-pulse text-muted-foreground" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
                    Thinking through your nutrition data...
                  </div>
                </div>
              )}
            </div>

            {messages.length === 1 && (
              <div className="grid gap-2 border-t px-6 py-4 sm:grid-cols-2">
                {suggestedPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start whitespace-normal py-3 text-left text-xs"
                    disabled={!canChat}
                    onClick={() => sendMessage(prompt)}
                  >
                    <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                    {prompt}
                  </Button>
                ))}
              </div>
            )}

            <div className="border-t p-4">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask InsightPilot AI about today's macros, recent logs, or meal ideas..."
                  className="min-h-[64px] resize-none"
                  disabled={!canChat}
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-[64px] w-[64px] shrink-0"
                  disabled={!input.trim() || !canChat}
                  onClick={() => sendMessage()}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
              {!statusData?.can_chat && (
                <p className="mt-3 text-sm text-muted-foreground">{accessMessage(statusData)}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Private Test Status
              </CardTitle>
              <CardDescription>{accessMessage(statusData)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-medium">{formatProviderName(statusData?.provider)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium">{statusData?.model ?? "Checking..."}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">API key</span>
                <span className="font-medium">{statusData?.configured ? "Configured" : "Missing"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allowlist</span>
                <span className="font-medium">{statusData?.private_access ? "Allowed" : "Blocked"}</span>
              </div>
              {!statusData?.can_chat && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{accessMessage(statusData)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Usage</CardTitle>
              <CardDescription>For the current private AI testing month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Messages</span>
                  <span>
                    {formatNumber(statusData?.usage.messages ?? 0)} /{" "}
                    {formatNumber(statusData?.limits.monthly_messages ?? 0)}
                  </span>
                </div>
                <Progress value={messageUsage} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Tokens</span>
                  <span>
                    {formatNumber(statusData?.usage.total_tokens ?? 0)} /{" "}
                    {formatNumber(statusData?.limits.monthly_tokens ?? 0)}
                  </span>
                </div>
                <Progress value={tokenUsage} />
              </div>
              <div className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                Tokens are counted by the selected AI provider after each response and logged in Django for cost tracking.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
