"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { parseFbrList, type FbrKind } from "@/lib/fbr";
import { clearFbrRefCache } from "@/lib/fbrRef";

type Settings = {
  businessName: string;
  ntn: string | null;
  province: string | null;
  enabled: boolean;
  environment: string;
  pricesIncludeTax: boolean;
};

export default function FbrListsClient({
  kinds,
  loaded,
  settings,
  senderLastSeen,
}: {
  kinds: { kind: FbrKind; label: string; hint: string }[];
  loaded: Record<string, number>;
  settings: Settings;
  senderLastSeen: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<FbrKind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load(kind: FbrKind) {
    setMsg(null);
    let parsed;
    try {
      parsed = parseFbrList(kind, text);
    } catch {
      setMsg({ ok: false, text: "That is not valid JSON. Paste the whole list exactly as FBR shows it, starting with [ and ending with ]." });
      return;
    }
    if (parsed.items.length === 0) {
      setMsg({ ok: false, text: "No rows could be read from that list. Check that it is the right list for this button." });
      return;
    }
    setBusy(true);
    try {
      const supabase = await getBrowserClient();
      const { data, error } = await supabase.rpc("import_fbr_reference", { p_kind: kind, p_items: parsed.items, p_replace: true });
      if (error) {
        setMsg({ ok: false, text: error.message });
      } else {
        clearFbrRefCache();
        setMsg({ ok: true, text: `Loaded ${data} rows.${parsed.skipped ? ` ${parsed.skipped} rows could not be read and were skipped.` : ""}` });
        setText("");
        setOpen(null);
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "The connection dropped. Nothing was loaded. Try again." });
    }
    setBusy(false);
  }

  const seenAgo = senderLastSeen ? Math.round((Date.now() - new Date(senderLastSeen).getTime()) / 60000) : null;

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <h2 className="font-display text-2xl font-semibold">Shop and FBR settings</h2>
        <dl className="mt-3 space-y-1.5 text-[15px]">
          <div className="flex justify-between gap-4"><dt className="text-lead">Seller name</dt><dd>{settings.businessName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-lead">Seller NTN</dt><dd>{settings.ntn ?? "Missing"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-lead">Province</dt><dd>{settings.province ?? "Missing"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-lead">FBR bills</dt><dd>{settings.enabled ? "ON" : "OFF"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-lead">Mode</dt><dd>{settings.environment === "production" ? "Production (real FBR)" : "Sandbox (test)"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-lead">GST</dt><dd>{settings.pricesIncludeTax ? "Included in price" : "Added on top of price"}</dd></div>
          <div className="flex justify-between gap-4">
            <dt className="text-lead">FBR sender (shop PC)</dt>
            <dd>{seenAgo == null ? "Not running yet (phase D4)" : seenAgo <= 3 ? "Online" : `Last seen ${seenAgo} min ago`}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-lead">
          To switch FBR bills on or off, run in Supabase: <code className="rounded bg-plate px-1.5 py-0.5">update public.business_profile set fbr_enabled = true;</code>
        </p>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="font-display text-2xl font-semibold">FBR lists</h2>
        <p className="mt-1 text-sm text-lead">
          Until the sender program is running (phase D4), load each list by hand: open it in the PRAL portal or Postman with your sandbox token, copy the
          whole JSON, paste it here. Loading replaces the old list.
        </p>
        {msg && (
          <p role="alert" className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-cell/10 text-cell-deep" : "bg-terminal/10 text-terminal-deep"}`}>
            {msg.text}
          </p>
        )}
        <ul className="mt-3 divide-y divide-line">
          {kinds.map((k) => (
            <li key={k.kind} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{k.label}</p>
                  <p className="text-sm text-lead">
                    {loaded[k.kind] > 0 ? `${loaded[k.kind]} loaded` : "Not loaded"} · {k.hint}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setOpen(open === k.kind ? null : k.kind);
                    setText("");
                    setMsg(null);
                  }}
                >
                  {open === k.kind ? "Close" : loaded[k.kind] > 0 ? "Reload" : "Load"}
                </button>
              </div>
              {open === k.kind && (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={6}
                    className="input font-mono text-xs"
                    placeholder="Paste the JSON list here"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button type="button" disabled={busy || !text.trim()} className="btn btn-primary" onClick={() => load(k.kind)}>
                    {busy ? "Loading" : `Load ${k.label.toLowerCase()}`}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-lead">
          Units allowed for each HS code are fetched by the sender program in phase D4. Until then all loaded units are offered.
        </p>
      </section>
    </div>
  );
}
