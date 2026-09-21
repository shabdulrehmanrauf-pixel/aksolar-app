import Icon from "./Icons";

/** Small confirmation message that floats above the bottom bar on phones. */
export default function Toast({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8"
    >
      {message && (
        <p className="anim-pop flex items-center gap-2 rounded-full bg-casing px-4 py-2.5 text-[15px] font-medium text-white shadow-lift">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cell">
            <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />
          </span>
          {message}
        </p>
      )}
    </div>
  );
}
