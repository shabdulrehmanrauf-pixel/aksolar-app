import { isValidPhone, normalizePhone } from "@/lib/customers";

/**
 * The phone's own contact chooser (Contact Picker API).
 * It only exists in Chrome on Android (over https). iPhone, desktop and most other browsers do not have it,
 * so callers must check contactPickerSupported() and hide the button when it is false.
 */
type ContactsApi = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

function api(): ContactsApi | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  if (!("ContactsManager" in window)) return null;
  const c = (navigator as unknown as { contacts?: ContactsApi }).contacts;
  return c && typeof c.select === "function" ? c : null;
}

export function contactPickerSupported(): boolean {
  return api() !== null;
}

export type PickedContact = { name: string; phone: string };

/** Opens the contact chooser. Returns null if the person closes it or the contact has nothing usable. */
export async function pickContact(): Promise<PickedContact | null> {
  const c = api();
  if (!c) return null;
  try {
    const found = await c.select(["name", "tel"], { multiple: false });
    const first = found[0];
    if (!first) return null;
    const name = (first.name?.[0] ?? "").trim();
    // A contact can have several numbers: take the first one that is a valid phone number.
    const phone = (first.tel ?? []).map(normalizePhone).find((t) => isValidPhone(t)) ?? "";
    if (!name && !phone) return null;
    return { name, phone };
  } catch {
    return null; // closed without choosing, or permission refused
  }
}
