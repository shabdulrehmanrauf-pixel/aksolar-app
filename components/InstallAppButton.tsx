"use client";

import { useEffect, useState } from "react";
import Icon from "./Icons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready || installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    if (isIos()) {
      setShowIosHint((v) => !v);
    }
  }

  // Nothing to offer: not Chrome/Edge-style install prompt available, and not iOS either.
  if (!deferredPrompt && !isIos()) return null;

  return (
    <div>
      <button type="button" onClick={handleClick} className="btn btn-quiet w-full">
        <Icon name="download" className="h-[18px] w-[18px]" />
        Install app
      </button>
      {showIosHint && (
        <p className="mt-2 px-1 text-sm text-lead">
          On iPhone/iPad: tap the Share icon in Safari, then &ldquo;Add to Home Screen&rdquo;.
        </p>
      )}
    </div>
  );
}
