"use client";

import { useEffect, useState } from "react";
import { openCommand } from "@/lib/command";
import { getRecognition } from "@/lib/speech";
import Icon from "./Icons";

/** Phone only: the "Type or speak" bar that sits above the tab bar on Home. Tapping it opens the search box. */
export default function HomeCommandBar() {
  const [voiceOk, setVoiceOk] = useState(false);
  useEffect(() => setVoiceOk(getRecognition() !== null), []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2.5 lg:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-1.5 rounded-full border border-line/70 bg-white p-1.5 pl-2 shadow-lift">
        <button
          type="button"
          onClick={() => openCommand()}
          className="flex min-h-11 flex-1 items-center gap-2.5 rounded-full px-3 text-left text-[15px] text-lead"
        >
          <Icon name="sparkle" className="h-5 w-5 text-sun-deep" />
          Search or speak
        </button>
        {voiceOk && (
          <button
            type="button"
            onClick={() => openCommand({ listen: true })}
            aria-label="Speak to search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-casing text-white shadow-md transition-transform active:scale-95"
          >
            <Icon name="mic" className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
