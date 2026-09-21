"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { COMMAND_EVENT } from "@/lib/command";

// The search box code is only downloaded the first time someone opens it (keeps every page light).
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

/** Listens for Ctrl+K and for openCommand() calls, and shows the search box. */
export default function CommandHost() {
  const [open, setOpen] = useState(false);
  const [listen, setListen] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setListen(!!(e as CustomEvent<{ listen?: boolean }>).detail?.listen);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setListen(false);
        setOpen((v) => !v);
      }
    };
    window.addEventListener(COMMAND_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(COMMAND_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;
  return <CommandPalette startListening={listen} onClose={() => setOpen(false)} />;
}
