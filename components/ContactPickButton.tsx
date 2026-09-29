"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icons";
import { contactPickerSupported, pickContact, type PickedContact } from "@/lib/contactPicker";

/** "Pick from phone contacts". Shows only on phones/browsers that support it, otherwise renders nothing. */
export default function ContactPickButton({
  onPick,
  className = "",
}: {
  onPick: (contact: PickedContact) => void;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setSupported(contactPickerSupported());
  }, []);

  if (!supported) return null;

  async function choose() {
    setNote(null);
    const c = await pickContact();
    if (!c) return;
    if (!c.phone) setNote("That contact has no usable phone number. Only the name was filled in.");
    onPick(c);
  }

  return (
    <div className={className}>
      <button type="button" onClick={choose} className="btn btn-quiet btn-sm">
        <Icon name="userplus" className="h-4 w-4" /> Pick from phone contacts
      </button>
      {note && <p className="mt-1 text-sm text-lead">{note}</p>}
    </div>
  );
}
