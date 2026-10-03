"use client";

import { PAY_NOTE_HINT } from "@/lib/invoices";
import type { PaymentMethod } from "@/lib/types";

/**
 * The "which bank / which EasyPaisa / which POS machine" note under the payment method.
 * Optional, saved on the payment, and shown later in the Cash book. Not shown for cash.
 */
export default function PayNoteField({
  id,
  method,
  value,
  onChange,
}: {
  id: string;
  method: PaymentMethod;
  value: string;
  onChange: (v: string) => void;
}) {
  const hint = PAY_NOTE_HINT[method];
  if (!hint) return null;
  return (
    <div className="mt-3">
      <label htmlFor={id} className="text-sm font-medium text-lead">
        {hint.label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint.placeholder}
        className="input mt-1.5"
        autoComplete="off"
      />
    </div>
  );
}
