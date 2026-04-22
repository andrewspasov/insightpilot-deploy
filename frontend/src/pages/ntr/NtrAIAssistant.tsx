import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChatMessage } from "@/components/dashboard/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { ChatMessage as ChatMessageType } from "@/types/dashboard";

const mockMessages: ChatMessageType[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hello! I'm the NicheTrendRadar AI. I can help you analyze niches, spot trend breaks, and summarize reports. What would you like to explore?",
    timestamp: new Date(),
  },
];

const suggestedPrompts = [
  "What are the top trending products this week?",
  "Analyze price trends for wireless earbuds",
  "Show competitor insights for my top product",
  "Generate a market report for smart home devices",
];

export default function NtrAIAssistant() {
  const [messages, setMessages] = useState<ChatMessageType[]>(mockMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulated AI response for now.
    setTimeout(() => {
      const aiMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "This is a mock response. In production, this will connect to your AI backend to analyze NTR data.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="space-y-6 animate-in h-[calc(100vh-8rem)] flex flex-col">
      <PageHeader
        title="AI Assistant"
        description="Ask questions about your niches, automations, and reports"
        icon={MessageSquare}
      />

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex gap-3 mb-4 animate-fade-in">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <Sparkles className="h-4 w-4 animate-pulse" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-sm text-muted-foreground">Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {messages.length === 1 && (
          <div className="p-6 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {suggestedPrompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="justify-start text-left h-auto py-2 px-3"
                  onClick={() => handlePromptClick(prompt)}
                >
                  <Sparkles className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-xs">{prompt}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything about your tracked niches..."
              className="min-h-[60px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[60px] w-[60px] flex-shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
