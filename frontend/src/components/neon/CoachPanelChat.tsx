import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCoachChat } from "@/hooks/use-coach-chat";
import { ChatBubble } from "@/pages/nutrition/NutritionAI";
import { ThinkingDots } from "./CoachMascot";

// The chat inside the floating coach panel: the same conversation as the AI page.
export default function CoachPanelChat() {
  const coach = useCoachChat();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [coach.messages.length, coach.isSending]);

  const send = async () => {
    const text = input.trim();
    if (!text || !coach.canChat) return;
    setInput("");
    await coach.send(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {coach.messages.length === 0 && (
          <p className="px-2 pt-6 text-center text-sm text-muted-foreground">
            Ask about today's macros, what to eat next, or your plan.
          </p>
        )}
        {coach.messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            actionDisabled={coach.actionDisabled}
            onConfirmAction={coach.confirmAction}
            onCancelAction={coach.cancelAction}
          />
        ))}
        {coach.isSending && (
          <div className="w-fit rounded-2xl rounded-tl-sm border border-violet-400/40 bg-violet-950/40 px-4 py-3">
            <ThinkingDots />
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={coach.status?.can_chat === false ? "The coach isn't available for this account." : "Ask your coach…"}
          aria-label="Message the coach"
          className="min-h-[48px] resize-none rounded-2xl"
          disabled={!coach.canChat}
        />
        <Button type="button" size="icon" aria-label="Send" className="h-12 w-12 shrink-0 rounded-full" disabled={!input.trim() || !coach.canChat} onClick={send}>
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
