import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Bot, CheckCircle2, Lock, Plus, Send, Sparkles, User, XCircle } from "lucide-react";

import { useCoachChat } from "@/hooks/use-coach-chat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PlanProposalCard, ProgramUpdateCard } from "@/components/nutrition/plans/PlanActionCards";
import { CoachSettingsCard } from "@/components/nutrition/CoachSettingsCard";
import { CoachMascot, ThinkingDots } from "@/components/neon/CoachMascot";
import type { PlanPace } from "@/types/plans";
import type {
  InsightAIAction,
  InsightAIHistoryMessage,
  InsightAIMessage,
  InsightAIStatus,
} from "@/types/insight-ai";

type NutritionAgent = "insightpilot" | "chatgpt";

const agentOptions: Record<
  NutritionAgent,
  {
    name: string;
    label: string;
    description: string;
    status: string;
    provider: string;
    model: string;
    cost: string;
    welcome: string;
  }
> = {
  insightpilot: {
    name: "InsightPilot Agent",
    label: "Default",
    description: "Local/Ollama agent for learning and testing without ChatGPT API cost.",
    status: "Display ready. Backend Ollama routing comes next.",
    provider: "Ollama local",
    model: "Local model later",
    cost: "No API cost",
    welcome:
      "I am InsightPilot Agent. My local Ollama engine will be connected next, so use ChatGPT Agent for working chat today.",
  },
  chatgpt: {
    name: "ChatGPT Agent",
    label: "Fallback",
    description: "Current working OpenAI API agent using the existing backend integration.",
    status: "Ready when backend access is configured.",
    provider: "OpenAI API",
    model: "Backend selected",
    cost: "OpenAI API usage",
    welcome:
      "I am ChatGPT Agent. Ask me about your nutrition logs, macros, targets, or recent trends.",
  },
};

function buildStarterMessages(agent: NutritionAgent): InsightAIMessage[] {
  return [
    {
      id: `${agent}-welcome`,
      role: "assistant",
      content: agentOptions[agent].welcome,
      timestamp: new Date(),
    },
  ];
}

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

function selectedAgentAccessMessage(agent: NutritionAgent, statusData: InsightAIStatus | undefined) {
  if (agent === "insightpilot") {
    return agentOptions.insightpilot.status;
  }
  return accessMessage(statusData);
}

function actionPayloadLabel(action: InsightAIAction) {
  const payload = action.payload;
  const quantity = typeof payload.quantity === "number" ? payload.quantity : String(payload.quantity ?? "");
  const unit = String(payload.unit ?? "");
  const foodName = String(payload.food_name ?? "meal");
  const mealType = String(payload.meal_type ?? "meal");
  const entryDate = String(payload.entry_date ?? "today");
  return `${quantity}${unit ? ` ${unit}` : ""} ${foodName} - ${mealType} - ${entryDate}`;
}

function actionMacroLabel(action: InsightAIAction) {
  const payload = action.payload;
  const calories = Number(payload.calories ?? 0);
  const protein = Number(payload.protein_grams ?? 0);
  const carbs = Number(payload.carbs_grams ?? 0);
  const fat = Number(payload.fat_grams ?? 0);
  return `${formatNumber(calories)} kcal - P ${formatNumber(protein)}g - C ${formatNumber(carbs)}g - F ${formatNumber(fat)}g`;
}

const ACTION_LABELS: Record<string, { confirm: string; done: string }> = {
  log_meal: { confirm: "Confirm log", done: "Logged to Nutrition." },
  edit_diary: { confirm: "Confirm changes", done: "Diary updated." },
  log_weight: { confirm: "Confirm log", done: "Weight logged." },
  update_plan: { confirm: "Change pace", done: "Plan updated." },
  delete_plan: { confirm: "End plan", done: "Plan ended." },
};

function PendingActionCard({
  action,
  disabled,
  onConfirm,
  onCancel,
}: {
  action: InsightAIAction;
  disabled: boolean;
  onConfirm: (actionId: number) => void;
  onCancel: (actionId: number) => void;
}) {
  const isPending = action.status === "pending";
  const isConfirmed = action.status === "confirmed";
  const isCancelled = action.status === "cancelled";
  const isFailed = action.status === "failed";
  const labels = ACTION_LABELS[action.action_type] ?? { confirm: "Confirm", done: "Done." };
  const lines = Array.isArray(action.payload.lines) ? (action.payload.lines as string[]) : [];

  return (
    <div className="mt-3 rounded-2xl border bg-background p-4 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Review action</p>
          <p className="mt-1 text-sm text-muted-foreground">{action.summary}</p>
          {action.action_type === "log_meal" && (
            <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs leading-5">
              <p className="font-medium text-foreground">{actionPayloadLabel(action)}</p>
              <p className="text-muted-foreground">{actionMacroLabel(action)}</p>
            </div>
          )}
          {lines.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-xl bg-muted/60 p-3 text-xs leading-5">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {isPending && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" type="button" disabled={disabled} onClick={() => onConfirm(action.id)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {labels.confirm}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onCancel(action.id)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
          {isConfirmed && <p className="mt-3 text-xs font-medium text-emerald-600">{labels.done}</p>}
          {isCancelled && <p className="mt-3 text-xs font-medium text-muted-foreground">Action cancelled.</p>}
          {isFailed && (
            <p className="mt-3 text-xs font-medium text-destructive">{action.error_message || "Action failed."}</p>
          )}
          {!isPending && !isConfirmed && !isCancelled && !isFailed && (
            <p className="mt-3 text-xs font-medium text-destructive">Action {action.status}.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatBubble({
  message,
  actionDisabled,
  onConfirmAction,
  onCancelAction,
}: {
  message: InsightAIMessage;
  actionDisabled: boolean;
  onConfirmAction: (actionId: number, options?: { pace?: PlanPace }) => Promise<InsightAIAction | null>;
  onCancelAction: (actionId: number) => void;
}) {
  const isUser = message.role === "user";
  const action = message.pendingAction;
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
              ? "rounded-tr-sm border border-primary/60 bg-primary/15 text-foreground shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
              : "rounded-tl-sm border border-violet-400/40 bg-violet-950/30 shadow-[0_0_16px_rgba(139,92,246,0.2)]",
          )}
        >
          {message.content}
        </div>
        <div className="mt-1 px-1 text-xs text-muted-foreground">{formatTime(message.timestamp)}</div>
        {!isUser && action?.action_type === "create_plan" && (
          <PlanProposalCard action={action} disabled={actionDisabled} onConfirm={onConfirmAction} onCancel={onCancelAction} />
        )}
        {!isUser && action?.action_type === "update_program" && (
          <ProgramUpdateCard action={action} disabled={actionDisabled} onConfirm={onConfirmAction} onCancel={onCancelAction} />
        )}
        {!isUser && action && action.action_type !== "create_plan" && action.action_type !== "update_program" && (
          <PendingActionCard
            action={action}
            disabled={actionDisabled}
            onConfirm={(id) => void onConfirmAction(id)}
            onCancel={onCancelAction}
          />
        )}
      </div>
    </div>
  );
}

export default function NutritionAI() {
  const coach = useCoachChat();
  // Reopen on the ChatGPT agent when there is a saved conversation.
  const [selectedAgent, setSelectedAgent] = useState<NutritionAgent>(
    coach.messages.length > 0 ? "chatgpt" : "insightpilot",
  );
  const [input, setInput] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  // The Plan page can open the chat with a plan-building starter message.
  const prefill = (location.state as { prefill?: string } | null)?.prefill;
  useEffect(() => {
    if (!prefill) return;
    setSelectedAgent("chatgpt");
    setInput(prefill);
    navigate(location.pathname, { replace: true, state: null });
  }, [prefill, navigate, location.pathname]);
  const statusData = coach.status;
  const isChatGPTAgent = selectedAgent === "chatgpt";
  const messages = isChatGPTAgent
    ? [...buildStarterMessages("chatgpt"), ...coach.messages]
    : buildStarterMessages("insightpilot");
  const canChat = isChatGPTAgent && coach.canChat;
  const actionDisabled = coach.actionDisabled;
  const hasChat = coach.messages.length > 0;
  const startNewChat = coach.startNewChat;
  const handleConfirmAction = coach.confirmAction;
  const handleCancelAction = coach.cancelAction;

  const sendMessage = async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || !canChat) {
      return;
    }
    setInput("");
    await coach.send(text);
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
          <CoachMascot size={52} thinking={coach.isSending} className="mx-2" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">InsightPilot AI</h1>
            <p className="text-muted-foreground">
              Private nutrition AI test powered by your logged meals, targets, and recent trends.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(agentOptions) as NutritionAgent[]).map((agent) => {
          const option = agentOptions[agent];
          const isSelected = selectedAgent === agent;
          return (
            <button
              key={agent}
              type="button"
              onClick={() => setSelectedAgent(agent)}
              className={cn(
                "rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/60",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary/25",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{option.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {option.label}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span>{option.provider}</span>
                <span>{agent === "chatgpt" ? statusData?.model ?? option.model : option.model}</span>
                <span>{option.cost}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[680px] flex-col overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{agentOptions[selectedAgent].name}</CardTitle>
              {isChatGPTAgent && hasChat && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={coach.isSending}>
                      <Plus className="mr-1 h-4 w-4" />
                      New chat
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
                      <AlertDialogDescription>This clears the conversation in this browser.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={startNewChat}>New chat</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <CardDescription>
              {selectedAgent === "insightpilot"
                ? "Default local agent display is ready. Backend Ollama routing is the next step."
                : "Ask questions. The AI can prepare nutrition logs, but you confirm before anything is saved."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  actionDisabled={actionDisabled}
                  onConfirmAction={handleConfirmAction}
                  onCancelAction={handleCancelAction}
                />
              ))}
              {coach.isSending && (
                <div className="flex gap-3">
                  <CoachMascot size={36} ring={false} thinking />
                  <div className="rounded-2xl rounded-tl-sm border border-violet-400/40 bg-violet-950/30 px-4 py-3">
                    <ThinkingDots />
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
              {!canChat && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {selectedAgentAccessMessage(selectedAgent, statusData)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <CoachSettingsCard />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4" />
                Agent Status
              </CardTitle>
              <CardDescription>{selectedAgentAccessMessage(selectedAgent, statusData)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-medium">{agentOptions[selectedAgent].name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-medium">
                  {selectedAgent === "chatgpt" ? formatProviderName(statusData?.provider) : "Ollama"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium">
                  {selectedAgent === "chatgpt" ? statusData?.model ?? "Checking..." : "Connect next"}
                </span>
              </div>
              {selectedAgent === "chatgpt" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">API key</span>
                    <span className="font-medium">{statusData?.configured ? "Configured" : "Missing"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Allowlist</span>
                    <span className="font-medium">{statusData?.private_access ? "Allowed" : "Blocked"}</span>
                  </div>
                </>
              )}
              {!canChat && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{selectedAgentAccessMessage(selectedAgent, statusData)}</span>
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
