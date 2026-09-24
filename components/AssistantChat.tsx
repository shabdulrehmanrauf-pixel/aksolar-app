"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";

type Msg = { role: "user" | "assistant"; content: string; looked?: string[] };

// Shown as a small "Looked up: …" note so people can see where an answer came from.
const LOOKUP_LABELS: Record<string, string> = { lookup_inventory: "stock", lookup_customer: "customers" };

export default function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState("AK Solar Assistant");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Shows the persona's real name in the empty state, without waiting for a first reply.
  useEffect(() => {
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) setPersonaName(data.name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      const looked = ((data.toolsUsed as string[] | undefined) ?? []).map((t) => LOOKUP_LABELS[t]).filter(Boolean);
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply as string, looked }]);
      if (data.personaName) setPersonaName(data.personaName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col lg:h-[calc(100dvh-10.5rem)]">
      <div className="card flex-1 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sun/20 text-casing">
              <Icon name="sparkle" className="h-6 w-6" />
            </span>
            <p className="font-semibold text-casing">{personaName}</p>
            <p className="max-w-sm text-sm text-lead">
              Ask about a stock item, a price, a customer&apos;s udhaar, or today&apos;s numbers. It looks things up in your
              real records — it can&apos;t create or change anything in the shop yet.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    m.role === "user" ? "bg-casing text-white" : "border border-line bg-plate text-casing"
                  }`}
                >
                  {m.content}
                  {m.looked && m.looked.length > 0 && (
                    <p className="mt-1.5 text-xs text-lead">Looked up: {m.looked.join(" · ")}</p>
                  )}
                </div>
              </li>
            ))}
            {sending && (
              <li className="flex justify-start">
                <div className="rounded-2xl border border-line bg-plate px-4 py-2.5 text-sm text-lead">Thinking…</div>
              </li>
            )}
            <div ref={bottomRef} />
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-terminal/10 px-3.5 py-2.5 text-sm text-terminal-deep" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          className="input min-h-11 flex-1 resize-none"
          rows={1}
          placeholder="Ask something, e.g. how many Osaka batteries are left?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button type="button" className="btn btn-primary shrink-0" onClick={send} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
