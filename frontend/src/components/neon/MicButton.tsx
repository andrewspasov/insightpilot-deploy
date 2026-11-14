import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// The browser's speech recognition (Chrome, Edge, Safari). Not in every
// TypeScript DOM library yet, so it's typed loosely here.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const join = (a: string, b: string) => [a.trimEnd(), b.trim()].filter(Boolean).join(" ");

/**
 * Microphone button for dictating into a text box. What you say appears in the
 * box as you speak (`onChange`), after whatever was already typed. Click again
 * to stop. Hidden in browsers without speech recognition.
 */
export function MicButton({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const baseRef = useRef("");
  const finalRef = useRef("");
  const Ctor = recognitionClass();

  useEffect(() => () => recognitionRef.current?.abort(), []);
  useEffect(() => {
    if (disabled) recognitionRef.current?.stop();
  }, [disabled]);

  if (!Ctor) return null;

  const start = () => {
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    baseRef.current = value;
    finalRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalRef.current = join(finalRef.current, result[0].transcript);
        else interim = join(interim, result[0].transcript);
      }
      onChange(join(baseRef.current, join(finalRef.current, interim)));
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        toast({
          title: "Microphone is blocked",
          description: "Allow microphone access for this site (the icon in the address bar), then try again.",
          variant: "destructive",
        });
      } else if (event.error === "no-speech") {
        toast({ title: "Didn't catch that", description: "Click the microphone and try speaking again." });
      } else if (event.error !== "aborted") {
        toast({ title: "Dictation stopped", description: "Something went wrong with speech recognition. Try again." });
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const toggle = () => {
    if (listening) recognitionRef.current?.stop();
    else start();
  };

  return (
    <Button
      type="button"
      size="icon"
      variant={listening ? "default" : "outline"}
      aria-label={listening ? "Stop dictation" : "Dictate a message"}
      aria-pressed={listening}
      title={listening ? "Stop dictation" : "Dictate a message"}
      disabled={disabled}
      onClick={toggle}
      className={cn("relative shrink-0", listening && "mic-listening", className)}
    >
      {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </Button>
  );
}
