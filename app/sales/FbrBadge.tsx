import { FBR_LABEL, FBR_TONE, FBR_TONE_DARK, type FbrInfo } from "@/lib/fbrStatus";

/** Small coloured tag next to the payment tag: FBR waiting / sent / failed / unsure. Test bills say "(test)". */
export default function FbrBadge({ info, onDark }: { info: FbrInfo; onDark?: boolean }) {
  const tone = (onDark ? FBR_TONE_DARK : FBR_TONE)[info.status];
  const test = info.environment === "sandbox" ? " (test)" : "";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
      title={info.number ? `FBR invoice number ${info.number}` : undefined}
    >
      {FBR_LABEL[info.status]}
      {test}
    </span>
  );
}
