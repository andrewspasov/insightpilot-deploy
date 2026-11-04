import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { InsightAIMessage } from "@/types/insight-ai";

// The AI chat is saved on the server, so it follows the account to the phone
// app. A copy is kept in the browser so it shows instantly and still works
// when the server can't be reached. Only the newest messages are kept.
const KEY = "insight-ai-chat";
const URL = "/insight-ai/chat-history/";
const MAX_MESSAGES = 50;

function revive(saved: unknown): InsightAIMessage[] {
  if (!Array.isArray(saved)) return [];
  const now = Date.now();
  return saved.map((m: InsightAIMessage) => {
    // Messages written by the phone app have no timestamp.
    const message = { ...m, timestamp: m.timestamp ? new Date(m.timestamp) : new Date() };
    // A card left pending past its expiry can no longer be confirmed.
    return m.pendingAction?.status === "pending" && Date.parse(m.pendingAction.expires_at) < now
      ? { ...message, pendingAction: { ...m.pendingAction, status: "expired" as const } }
      : message;
  });
}

export function loadChatHistory(): InsightAIMessage[] {
  try {
    return revive(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

// The server copy, or null when it can't be reached. A chat saved only in this
// browser (before the server kept chats) moves up the first time.
export async function fetchChatHistory(): Promise<InsightAIMessage[] | null> {
  try {
    const { messages } = await apiGet<{ messages: InsightAIMessage[] }>(URL);
    if (messages.length) return revive(messages);
    const local = loadChatHistory();
    if (local.length) await uploadChatHistory(local);
    return local;
  } catch {
    return null;
  }
}

export function uploadChatHistory(messages: InsightAIMessage[]) {
  return apiPost<{ messages: InsightAIMessage[] }, { saved: number }>(URL, {
    messages: messages.slice(-MAX_MESSAGES),
  });
}

// "New chat": clears the conversation on the server too.
export async function deleteServerChatHistory() {
  await apiDelete(URL).catch(() => {});
}

export function saveChatHistory(messages: InsightAIMessage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // Saving is best effort; the chat keeps working without it.
  }
}

// Clears only this browser's copy (used on sign out; the server keeps the chat).
export function clearChatHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved to clear.
  }
}
