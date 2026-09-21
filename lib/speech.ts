/*
  Voice typing uses the browser's built-in speech recognition (no extra service, no cost).
  It works in Chrome and Edge on Android and desktop. iPhone Safari support is limited, so the
  microphone button is hidden wherever the browser does not offer it.
*/
export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type RecognitionCtor = new () => RecognitionLike;

export function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceLang = "en" | "ur";

export const VOICE_LOCALE: Record<VoiceLang, string> = {
  en: "en-PK",
  ur: "ur-PK",
};
