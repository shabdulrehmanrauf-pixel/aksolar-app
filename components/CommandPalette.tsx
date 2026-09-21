"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { customerMatches, formatPhone } from "@/lib/customers";
import { categoryLabel, isLow, isOut } from "@/lib/inventory";
import { formatRs } from "@/lib/format";
import { getRecognition, VOICE_LOCALE, type RecognitionLike, type VoiceLang } from "@/lib/speech";
import type { Category, Customer } from "@/lib/types";
import Icon, { type IconName } from "./Icons";

type StockRow = {
  id: string;
  brand: string;
  model: string;
  type: string | null;
  category: Category;
  quantity: number;
  reorder_level: number;
  sale_price: number;
};
type CustomerRow = Pick<Customer, "id" | "name" | "phone" | "cnic_or_ntn" | "address" | "registration_type">;

type Hit = {
  key: string;
  group: "Jump to" | "Stock" | "Customers";
  title: string;
  sub: string;
  icon: IconName;
  href: string;
  tag?: { text: string; tone: "bad" | "good" | "plain" };
};

const ACTIONS: Hit[] = [
  { key: "a-home", group: "Jump to", title: "Home", sub: "Overview of your shop", icon: "home", href: "/" },
  { key: "a-stock", group: "Jump to", title: "Inventory", sub: "All batteries, panels and accessories", icon: "battery", href: "/inventory" },
  { key: "a-cust", group: "Jump to", title: "Customers", sub: "Customer list and details", icon: "users", href: "/customers" },
  { key: "a-add-item", group: "Jump to", title: "Add item", sub: "Add a new item to stock", icon: "plus", href: "/inventory?add=1" },
  { key: "a-add-cust", group: "Jump to", title: "Add customer", sub: "Save a new customer", icon: "userplus", href: "/customers?add=1" },
];

const TAG_STYLE = {
  bad: "bg-terminal/10 text-terminal-deep",
  good: "bg-cell/10 text-cell-deep",
  plain: "bg-plate text-lead",
};

export default function CommandPalette({
  startListening,
  onClose,
}: {
  startListening: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [people, setPeople] = useState<CustomerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<VoiceLang>("en");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the searchable lists when the box opens.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("inventory")
        .select("id,brand,model,type,category,quantity,reorder_level,sale_price")
        .order("brand")
        .limit(2000),
      supabase
        .from("customers")
        .select("id,name,phone,cnic_or_ntn,address,registration_type")
        .order("name")
        .limit(2000),
    ])
      .then(([inv, cust]) => {
        if (cancelled) return;
        setStock((inv.data ?? []) as StockRow[]);
        setPeople((cust.data ?? []) as CustomerRow[]);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setVoiceOk(getRecognition() !== null);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
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
      rec.lang = VOICE_LOCALE[lang];
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        setQuery(text);
        setActive(0);
      };
      rec.onerror = (e) => {
        setListening(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setVoiceNote("The microphone is blocked. Allow it in your browser settings and try again.");
        } else if (e.error === "no-speech") {
          setVoiceNote("Did not hear anything. Tap the microphone and try again.");
        } else if (e.error !== "aborted") {
          setVoiceNote("Voice search did not work. You can type instead.");
        }
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceNote("Voice search did not start. You can type instead.");
    }
  }, [lang]);

  // Opened with the microphone button: start listening straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (startListening && voiceOk && !autoStarted.current) {
      autoStarted.current = true;
      listen();
    }
  }, [startListening, voiceOk, listen]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIONS;

    const words = q.split(/\s+/);
    const out: Hit[] = [];

    stock
      .filter((s) => {
        const hay = `${s.brand} ${s.model} ${s.type ?? ""} ${categoryLabel(s.category)}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 6)
      .forEach((s) => {
        const tag: Hit["tag"] = isOut(s)
          ? { text: "Out of stock", tone: "bad" }
          : isLow(s)
            ? { text: `${s.quantity} left`, tone: "bad" }
            : { text: `${s.quantity} in stock`, tone: "good" };
        out.push({
          key: `s-${s.id}`,
          group: "Stock",
          title: `${s.brand} ${s.model}`,
          sub: `${s.type ?? categoryLabel(s.category)} · ${formatRs(s.sale_price)}`,
          icon: s.category === "panel" ? "sun" : s.category === "accessory" ? "plug" : "battery",
          href: `/inventory?q=${encodeURIComponent(`${s.brand} ${s.model}`)}`,
          tag,
        });
      });

    people
      .filter((c) => customerMatches(c, q))
      .slice(0, 6)
      .forEach((c) =>
        out.push({
          key: `c-${c.id}`,
          group: "Customers",
          title: c.name,
          sub: c.phone ? formatPhone(c.phone) : "No phone saved",
          icon: "users",
          href: `/customers/${c.id}`,
          tag: { text: c.registration_type, tone: c.registration_type === "Registered" ? "good" : "plain" },
        })
      );

    ACTIONS.filter((a) => a.title.toLowerCase().includes(q)).forEach((a) => out.push(a));
    return out;
  }, [query, stock, people]);

  const go = useCallback(
    (hit: Hit) => {
      recRef.current?.abort();
      onClose();
      router.push(hit.href);
    },
    [onClose, router]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  useEffect(() => {
    document.getElementById(`cmd-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const searching = query.trim() !== "";

  return (
    <div
      className="anim-fade fixed inset-0 z-[70] bg-casing/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search stock and customers"
        onKeyDown={onKeyDown}
        className="anim-pop mx-auto flex h-dvh w-full flex-col overflow-hidden bg-white sm:mt-[9vh] sm:h-auto sm:max-h-[72vh] sm:max-w-xl sm:rounded-3xl sm:shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Icon name="search" className="h-5 w-5 shrink-0 text-lead" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={hits[active] ? `cmd-opt-${active}` : undefined}
            aria-label="Search"
            placeholder={listening ? "Listening" : "Type or speak: Osaka 200Ah, Ali Khan, 0300"}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-lead/70"
          />
          {voiceOk && (
            <button
              type="button"
              onClick={listening ? stopListening : listen}
              aria-label={listening ? "Stop listening" : "Speak to search"}
              aria-pressed={listening}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                listening ? "mic-live bg-terminal text-white" : "bg-casing text-white hover:bg-casing-2"
              }`}
            >
              <Icon name="mic" className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lead hover:bg-plate"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {voiceOk && (
          <div className="flex items-center gap-2 border-b border-line/70 bg-plate/60 px-4 py-2 text-sm text-lead">
            <span>Voice language</span>
            <div role="group" aria-label="Voice language" className="flex rounded-full bg-white p-0.5 ring-1 ring-line">
              {(["en", "ur"] as VoiceLang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    lang === l ? "bg-casing text-white" : "text-lead hover:text-casing"
                  }`}
                >
                  {l === "en" ? "English" : "Urdu"}
                </button>
              ))}
            </div>
          </div>
        )}
        {voiceNote && (
          <p role="status" className="border-b border-line/70 bg-sun/15 px-4 py-2 text-sm">
            {voiceNote}
          </p>
        )}

        <div id="cmd-list" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
          {searching && !loaded && (
            <div className="space-y-2 p-2" aria-hidden="true">
              <div className="skeleton h-12 rounded-xl" />
              <div className="skeleton h-12 rounded-xl" />
            </div>
          )}

          {searching && loaded && hits.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="font-display text-2xl font-semibold">Nothing found</p>
              <p className="mt-1 text-lead">Check the spelling, or try just a brand, a name or a phone number.</p>
            </div>
          )}

          {hits.map((hit, i) => {
            const showGroup = i === 0 || hits[i - 1].group !== hit.group;
            const isActive = i === active;
            return (
              <div key={hit.key}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-[0.12em] text-lead">{hit.group}</p>
                )}
                <button
                  id={`cmd-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(hit)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isActive ? "bg-plate" : ""
                  }`}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-casing/[0.06] text-casing">
                    <Icon name={hit.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{hit.title}</span>
                    <span className="block truncate text-sm text-lead">{hit.sub}</span>
                  </span>
                  {hit.tag && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TAG_STYLE[hit.tag.tone]}`}>
                      {hit.tag.text}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="hidden items-center gap-4 border-t border-line bg-plate/60 px-4 py-2.5 text-xs text-lead sm:flex">
          <span>
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5">↑</kbd>{" "}
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5">↓</kbd> to move
          </span>
          <span>
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5">Enter</kbd> to open
          </span>
          <span>
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
