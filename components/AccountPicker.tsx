"use client";

import { accountsForMethod, kindLabel, type CashAccountChoice } from "@/lib/cash";

/**
 * "Paid from / received in" - only shown when there is a real choice (two or more accounts of the
 * right kind for this payment method, e.g. two banks). With one account the default is used silently.
 * value "" = use the default account for the method.
 */
export default function AccountPicker({
  id,
  choices,
  method,
  value,
  onChange,
  label = "Paid from",
  blankLabel,
}: {
  id: string;
  choices: CashAccountChoice[];
  method: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  /** Text for the empty choice. Defaults to "Usual ... account (name)". */
  blankLabel?: string;
}) {
  const options = accountsForMethod(choices, method);
  if (options.length < 2) return null;
  const def = options.find((o) => o.default_for.includes(method)) ?? options[0];
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
        <option value="">{blankLabel ?? `Usual ${kindLabel(def.kind).toLowerCase()} account (${def.name})`}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
