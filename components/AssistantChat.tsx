"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icons";
import AssistantProposalCard from "./AssistantProposalCard";
import type { ProposalCard } from "@/lib/ai/proposalTypes";
import { getRecognition, VOICE_LOCALE, type RecognitionLike, type VoiceLang } from "@/lib/speech";

type Msg = { role: "user" | "assistant"; content: string; looked?: string[]; cards?: ProposalCard[] };

// Shown as a small "Looked up: …" note so people can see where an answer came from.
const LOOKUP_LABELS: Record<string, string> = { lookup_inventory: "stock", lookup_customer: "customers", lookup_scrap: "scrap" };

export default function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState("AK Solar Assistant");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice input — same browser speech-recognition pattern as CommandPalette.tsx
  // (rule 15.2: reuse, don't duplicate). It only fills the text box; the
  // recognised text is always shown and the person still taps Send themselves.
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);

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

  useEffect(() => {
    setVoiceOk(getRecognition() !== null);
    return () => {
      recRef.current?.abort();
    };
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const listen = useCallback(() => {
    const Rec = getRecognition();
    if (!Rec) return;
    setVoiceNote(null);
    try {
      const rec = new Rec();
      rec.lang = VOICE_LOCALE[voiceLang];
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setInput(text);
      };
      rec.onerror = (e) => {
        setListening(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setVoiceNote("The microphone is blocked. Allow it in your browser settings and try again.");
        } else if (e.error === "no-speech") {
          setVoiceNote("Did not hear anything. Tap the microphone and try again.");
        } else if (e.error !== "aborted") {
          setVoiceNote("Voice input did not work. You can type instead.");
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceNote("Voice input did not start. You can type instead.");
    }
  }, [voiceLang]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    recRef.current?.abort();
    setListening(false);
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
      const cards = (data.proposals as ProposalCard[] | undefined) ?? [];
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply as string, looked, cards }]);
      if (data.personaName) setPersonaName(data.personaName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  /** A proposal card reports what happened, so the conversation (and the assistant) knows the real result. */
  function addNote(note: string) {
    setMessages((cur) => [...cur, { role: "assistant", content: note }]);
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
              Ask about stock, prices or a customer&apos;s udhaar. You can also ask it to prepare a bill, a new item or a
              new customer — nothing is saved until you tap Confirm.
              {voiceOk && " Tap the microphone to speak instead of typing."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
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
                {m.cards?.map((c) => (
                  <AssistantProposalCard key={c.id} card={c} onOutcome={addNote} />
                ))}
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

      {voiceOk && (
        <div className="mt-3 flex items-center gap-2 text-sm text-lead">
          <span>Voice language</span>
          <div role="group" aria-label="Voice language" className="flex rounded-full bg-plate p-0.5 ring-1 ring-line">
            {(["en", "ur"] as VoiceLang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setVoiceLang(l)}
                aria-pressed={voiceLang === l}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  voiceLang === l ? "bg-casing text-white" : "text-lead hover:text-casing"
                }`}
              >
                {l === "en" ? "English" : "Urdu"}
              </button>
            ))}
          </div>
        </div>
      )}
      {voiceNote && (
        <p role="status" className="mt-2 rounded-xl bg-sun/15 px-3.5 py-2 text-sm">
          {voiceNote}
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          className="input min-h-11 flex-1 resize-none"
          rows={1}
          placeholder={listening ? "Listening…" : "Ask, or e.g. bill Ali Traders 2 Phoenix 150Ah on udhaar"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        {voiceOk && (
          <button
            type="button"
            onClick={listening ? stopListening : listen}
            aria-label={listening ? "Stop listening" : "Speak your message"}
            aria-pressed={listening}
            disabled={sending}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              listening ? "mic-live bg-terminal text-white" : "bg-casing text-white hover:bg-casing-2"
            }`}
          >
            <Icon name="mic" className="h-5 w-5" />
          </button>
        )}
        <button type="button" className="btn btn-primary shrink-0" onClick={send} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
