"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "Which dish did we waste most last month?",
  "How much paneer should I order for the weekend?",
  "What do we expect to sell tomorrow?",
  "Is tomorrow's prep plan approved?",
  "How did sales go this week?",
];

export function AssistantChat({ outletId, outletName, mode }: { outletId: string; outletName: string; mode: "claude" | "offline" }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    start(async () => {
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outletId, messages: next.map(({ role, content }) => ({ role, content })) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setMessages([...next, { role: "assistant", content: data.reply, tools: data.toolsUsed }]);
      } catch (e) {
        toast.error((e as Error).message);
        setMessages(messages);
      }
    });
  }

  return (
    <Card className="flex min-h-[70vh] flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Ask about {outletName}
        </CardTitle>
        <CardDescription>
          Answers come from your own sales, waste, forecast and stock data.{" "}
          {mode === "offline" ? (
            <Badge variant="outline" className="ml-1">rule-based mode · set ANTHROPIC_API_KEY for Claude</Badge>
          ) : (
            <Badge variant="secondary" className="ml-1">Claude with tool calling</Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ScrollArea className="flex-1 rounded-lg border bg-muted/20 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Bot className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Try one of these:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" ? <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-4" /></span> : null}
                  <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border")}>
                    {m.content}
                    {m.tools?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[...new Set(m.tools)].map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {m.role === "user" ? <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted"><User className="size-4" /></span> : null}
                </div>
              ))}
              {pending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Looking at the data…
                </div>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </ScrollArea>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" disabled={pending} autoFocus />
          <Button type="submit" disabled={pending || !input.trim()}>
            <Send data-icon="inline-start" /> Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
