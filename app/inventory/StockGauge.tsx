const SEGMENTS = 6;

/**
 * A small battery-shaped gauge. Red when stock is at or below the reorder
 * level, green otherwise. A full gauge means about three times the reorder level.
 * Pass `animate` to make the bars fill up one by one when the gauge appears.
 */
export default function StockGauge({
  quantity,
  reorderLevel,
  animate = false,
}: {
  quantity: number;
  reorderLevel: number;
  animate?: boolean;
}) {
  const wellStocked = Math.max(reorderLevel * 3, 3);
  const filled =
    quantity <= 0
      ? 0
      : Math.min(SEGMENTS, Math.max(1, Math.round((quantity / wellStocked) * SEGMENTS)));
  const low = quantity <= reorderLevel;

  return (
    <span
      role="img"
      aria-label={`${quantity} in stock, reorder at ${reorderLevel}`}
      className="inline-flex items-center"
    >
      <span className="flex gap-[2px] rounded-[4px] border-[1.5px] border-lead/60 p-[2px]">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            style={animate ? ({ "--seg": i } as React.CSSProperties) : undefined}
            className={`h-3.5 w-1.5 rounded-[1.5px] ${animate && i < filled ? "gauge-seg" : ""} ${
              i < filled ? (low ? "bg-terminal" : "bg-cell") : "bg-line"
            }`}
          />
        ))}
      </span>
      <span className="h-2 w-[3px] rounded-r-sm bg-lead/60" />
    </span>
  );
}
