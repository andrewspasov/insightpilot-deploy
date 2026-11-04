import { useEffect, useRef, useState } from "react";

import {
  useCancelInsightAIAction,
  useConfirmInsightAIAction,
  useInsightAIChat,
  useInsightAIStatus,
} from "@/hooks/use-insight-ai";
import { useToast } from "@/hooks/use-toast";
import {
  clearChatHistory,
  deleteServerChatHistory,
  fetchChatHistory,
  loadChatHistory,
  saveChatHistory,
  uploadChatHistory,
} from "@/lib/chat-history";
import type { PlanPace } from "@/types/plans";
import type { InsightAIAction, InsightAIHistoryMessage, InsightAIMessage } from "@/types/insight-ai";

const CONFIRM_TITLES: Record<string, string> = {
  create_plan: "Plan created",
  update_program: "Program updated",
  edit_diary: "Diary updated",
  log_weight: "Weight logged",
  update_plan: "Plan updated",
  delete_plan: "Plan ended",
};

// The coach conversation, shared by the AI page, the floating coach panel and
// the phone app through the copy saved on the server.
export function useCoachChat() {
  const [messages, setMessages] = useState<InsightAIMessage[]>(loadChatHistory);
  // Uploads wait until the server copy has loaded, so a stale browser copy
  // never overwrites newer messages sent from the phone.
  const [synced, setSynced] = useState(false);
  const changedBeforeSync = useRef(false);
  const { toast } = useToast();
  const statusQuery = useInsightAIStatus();
  const chatMutation = useInsightAIChat();
  const confirmActionMutation = useConfirmInsightAIAction();
  const cancelActionMutation = useCancelInsightAIAction();

  useEffect(() => {
    let active = true;
    fetchChatHistory().then((server) => {
      if (!active) return;
      // Keep the browser copy if the server is unreachable or the user already started typing.
      if (server && !changedBeforeSync.current) setMessages(server);
      setSynced(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveChatHistory(messages);
    if (!synced) return;
    // Typing a few messages quickly sends one upload.
    const timer = setTimeout(() => uploadChatHistory(messages).catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [messages, synced]);

  const updatePendingAction = (action: InsightAIAction) => {
    setMessages((current) =>
      current.map((message) => (message.pendingAction?.id === action.id ? { ...message, pendingAction: action } : message)),
    );
  };

  const confirmAction = async (actionId: number, options?: { pace?: PlanPace }) => {
    try {
      const response = await confirmActionMutation.mutateAsync({ actionId, options });
      updatePendingAction(response.action);
      toast({
        title: CONFIRM_TITLES[response.action.action_type] ?? "Logged to Nutrition",
        description: response.action.summary,
      });
      return response.action;
    } catch (error) {
      toast({
        title: "Could not confirm action",
        description: error instanceof Error ? error.message : "InsightPilot AI could not apply this action.",
        variant: "destructive",
      });
      return null;
    }
  };

  const cancelAction = async (actionId: number) => {
    try {
      const response = await cancelActionMutation.mutateAsync(actionId);
      updatePendingAction(response.action);
    } catch (error) {
      toast({
        title: "Could not cancel action",
        description: error instanceof Error ? error.message : "InsightPilot AI could not cancel this action.",
        variant: "destructive",
      });
    }
  };

  const canChat = Boolean(statusQuery.data?.can_chat) && !chatMutation.isPending;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || !canChat) return false;

    const history: InsightAIHistoryMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    changedBeforeSync.current = true;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: text, timestamp: new Date() },
    ]);

    try {
      const response = await chatMutation.mutateAsync({ message: text, history });
      // A new plan card replaces any earlier one the server has now cancelled.
      const replacesPlan = response.pending_action?.action_type === "create_plan";
      setMessages((current) => [
        ...current.map((message) =>
          replacesPlan && message.pendingAction?.action_type === "create_plan" && message.pendingAction.status === "pending"
            ? { ...message, pendingAction: { ...message.pendingAction, status: "cancelled" as const } }
            : message,
        ),
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.reply,
          pendingAction: response.pending_action,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "InsightPilot AI failed to respond.",
          timestamp: new Date(),
        },
      ]);
    }
    return true;
  };

  const startNewChat = () => {
    clearChatHistory();
    deleteServerChatHistory();
    changedBeforeSync.current = true;
    setMessages([]);
  };

  return {
    messages,
    send,
    confirmAction,
    cancelAction,
    startNewChat,
    canChat,
    isSending: chatMutation.isPending,
    actionDisabled: confirmActionMutation.isPending || cancelActionMutation.isPending,
    status: statusQuery.data,
  };
}
