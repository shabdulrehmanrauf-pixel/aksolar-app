import { initials } from "@/lib/customers";

const TONES = [
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-700",
  "from-emerald-500 to-green-700",
  "from-slate-500 to-slate-800",
  "from-rose-500 to-red-700",
  "from-violet-500 to-indigo-700",
];

const SIZES = {
  sm: "h-9 w-9 text-[15px]",
  md: "h-11 w-11 text-lg",
  lg: "h-16 w-16 text-3xl",
};

/** Round initials badge. The colour comes from the name, so a person always has the same colour. */
export default function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-display font-bold text-white shadow-sm ${TONES[hash % TONES.length]} ${SIZES[size]}`}
    >
      {initials(name)}
    </span>
  );
}
