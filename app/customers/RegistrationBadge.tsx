import Icon from "@/components/Icons";
import type { RegistrationType } from "@/lib/types";

export default function RegistrationBadge({
  type,
  onDark = false,
}: {
  type: RegistrationType;
  onDark?: boolean;
}) {
  const registered = type === "Registered";
  const tone = registered
    ? onDark
      ? "bg-emerald-400/20 text-emerald-200"
      : "bg-cell/10 text-cell-deep"
    : onDark
      ? "bg-white/10 text-white/75"
      : "bg-lead/10 text-lead";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium ${tone}`}>
      {registered && <Icon name="shield" className="h-3.5 w-3.5" strokeWidth={2.2} />}
      {type}
    </span>
  );
}
