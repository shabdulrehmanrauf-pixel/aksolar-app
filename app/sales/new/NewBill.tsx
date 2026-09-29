"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Sheet from "@/components/Sheet";
import {
  cleanRegNo,
  customerMatches,
  formatPhone,
  formatRegNo,
  isValidPhone,
  normalizePhone,
  REGISTRATION_TYPES,
} from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { BATTERY_TYPES, categoryLabel, itemSpecs } from "@/lib/inventory";
import {
  friendlyInvoiceError,
  lineAmount,
  parseAmount,
  parseQty,
  PAYMENT_METHODS,
  paymentStatusFor,
  round2,
  todayKarachi,
} from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { billTax, isThirdSchedule, type TaxLineInput } from "@/lib/tax";
import { FALLBACK_PROVINCES } from "@/lib/fbr";
import { useFbrRef, useFbrSettings } from "@/lib/fbrRef";
import { checkRealConnectivity, isBrowserOnline } from "@/lib/offline/net";
import { offlineDb, hasIndexedDb, type LocalInvoice } from "@/lib/offline/db";
import { notifySyncListeners, runSync } from "@/lib/offline/sync";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import type { Customer, InventoryItem, InvoiceItem, PaymentMethod, PaymentStatus, RegistrationType } from "@/lib/types";
import CustomerForm from "@/app/customers/CustomerForm";
import ManualItemForm from "./ManualItemForm";

export type BillItem = Pick<
  InventoryItem,
  | "id"
  | "category"
  | "brand"
  | "model"
  | "type"
  | "voltage"
  | "plates"
  | "ah_rating"
  | "wattage"
  | "warranty_months"
  | "cost_price"
  | "sale_price"
  | "quantity"
> &
  Partial<
    Pick<
      InventoryItem,
      "hs_code" | "uom" | "sale_type" | "fbr_rate_desc" | "is_taxable" | "retail_price" | "sro_schedule_no" | "sro_item_serial_no"
    >
  >;
export type BillCustomer = Pick<Customer, "id" | "name" | "phone" | "registration_type" | "cnic_or_ntn"> &
  Partial<Pick<Customer, "province" | "address">>;

/** One row on the bill. Qty and rate are kept as text while typing, and checked before saving. */
type Line = { itemId: string; qty: string; rate: string };
type PayMode = "full" | "part" | "credit";

/**
 * An old battery the customer hands over in exchange for a new one on this bill (e.g. selling
 * a Daewoo 55 and taking back their old Daewoo 55). Kept per bill-line, keyed by line itemId.
 * Saved to the separate scrap battery inventory once the bill itself has saved successfully --
 * see record_scrap_intake() in supabase/07_scrap_battery.sql.
 */
type Replacement = {
  brand: string;
  model: string;
  batteryType: string;
  batteryNumber: string;
  qty: string;
  weight: string;
  note: string;
};

/** A bill the AI assistant prepared, opened here for editing (Phase 10 Part 3). Filled in once, then it's an ordinary bill. */
export type BillDraft = {
  walkinName: string;
  note: string;
  lines: { itemId: string; qty: string; rate: string }[];
  mode: PayMode;
  partText: string;
  method: PaymentMethod;
};

const PAY_MODES: { value: PayMode; label: string; hint: string }[] = [
  { value: "full", label: "Paid in full", hint: "Customer pays everything now" },
  { value: "part", label: "Part payment", hint: "Some now, the rest is udhaar" },
  { value: "credit", label: "Udhaar", hint: "Nothing paid now" },
];

function specText(item: BillItem) {
  return itemSpecs(item as InventoryItem) || categoryLabel(item.category);
}

export default function NewBill({
  stock: serverStock,
  customers: serverCustomers,
  initialCustomerId,
  initialDraft = null,
}: {
  stock: BillItem[];
  customers: BillCustomer[];
  initialCustomerId: string | null;
  initialDraft?: BillDraft | null;
}) {
  const router = useRouter();
  const roleInfo = useRoleInfo();
  const canOverridePrice = can(roleInfo, "price.override");
  const canAddManualItem = can(roleInfo, "inventory.edit");
  const isOwner = can(roleInfo, "team.manage");
  const fbrSettings = useFbrSettings();
  const provinceRows = useFbrRef("province");

  // Same offline-cache pattern as Inventory/Customers: mirror fresh server data
  // into IndexedDB, then always read the bill screen's stock and customer list
  // back out of IndexedDB so it reflects on-device stock changes from bills
  // made earlier today while offline, plus items added by hand mid-bill.
  useEffect(() => {
    if (!isBrowserOnline()) return;
    if (serverStock.length > 0) offlineDb.inventory.bulkPut(serverStock as InventoryItem[]).catch(() => {});
    if (serverCustomers.length > 0) offlineDb.customers.bulkPut(serverCustomers as Customer[]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverStock, serverCustomers]);

  const stock = useLiveQuery(() => offlineDb.inventory.toArray(), [], serverStock) as BillItem[];
  const customers = useLiveQuery(() => offlineDb.customers.toArray(), [], serverCustomers) as BillCustomer[];

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [walkinName, setWalkinName] = useState(initialDraft?.walkinName ?? "");
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [note, setNote] = useState(initialDraft?.note ?? "");

  // Walk-in bills can carry their own phone/address/tax details directly on the invoice,
  // without needing a saved customer record.
  const [walkinDetailsOpen, setWalkinDetailsOpen] = useState(false);
  const [walkinPhone, setWalkinPhone] = useState("");
  const [walkinAddress, setWalkinAddress] = useState("");
  const [walkinRegType, setWalkinRegType] = useState<RegistrationType>("Unregistered");
  const [walkinCnic, setWalkinCnic] = useState("");

  // The bill date defaults to today (Pakistan time) but can be set to any earlier date.
  const [invoiceDate, setInvoiceDate] = useState(() => todayKarachi());
  const today = useMemo(() => todayKarachi(), []);

  const [lines, setLines] = useState<Line[]>(initialDraft?.lines ?? []);
  const [itemQuery, setItemQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const itemInputRef = useRef<HTMLInputElement>(null);

  // Items typed in by hand (not found in stock search) get added to inventory automatically
  // and tracked here so their bill line can be flagged as new.
  const [extraStock, setExtraStock] = useState<BillItem[]>([]);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const [addingItem, setAddingItem] = useState(false);

  // Old batteries taken in exchange, one optional entry per battery line. See the Replacement type above.
  const [replacements, setReplacements] = useState<Record<string, Replacement>>({});

  // FBR bill: OFF by default for every bill. The Owner switches it ON per bill with the big switch at the top.
  const [fbrTick, setFbrTick] = useState<boolean | null>(null);
  const [buyerProvince, setBuyerProvince] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");

  const [mode, setMode] = useState<PayMode>(initialDraft?.mode ?? "full");
  const [partText, setPartText] = useState(initialDraft?.partText ?? "");
  const [method, setMethod] = useState<PaymentMethod>(initialDraft?.method ?? "cash");

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // If the bill saves but a replacement battery can't be recorded to the scrap pile (see
  // save() below), we hold the "go to receipt" navigation here and show it on-screen instead
  // of only logging to the console, so counter staff actually see it before leaving the page.
  const [scrapFailure, setScrapFailure] = useState<{
    names: string[];
    goTo: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  // Items added by hand this session join the searchable stock list straight away.
  const allStock = useMemo(() => {
    // Lines pre-filled from an AI draft must always resolve, even in the split second before the
    // on-device cache has caught up with the server list.
    const have = new Set(stock.map((s) => s.id));
    const fromDraft = initialDraft
      ? serverStock.filter((s) => !have.has(s.id) && initialDraft.lines.some((l) => l.itemId === s.id))
      : [];
    return [...stock, ...fromDraft, ...extraStock];
  }, [stock, extraStock, serverStock, initialDraft]);
  const byId = useMemo(() => new Map(allStock.map((s) => [s.id, s])), [allStock]);

  /* ---------- Item search ---------- */
  const hits = useMemo(() => {
    const words = itemQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return allStock
      .filter((s) => {
        const hay = `${s.brand} ${s.model} ${s.type ?? ""} ${categoryLabel(s.category)} ${s.ah_rating ?? ""}ah ${s.wattage ?? ""}w`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [itemQuery, allStock]);

  const addItem = useCallback(
    (item: BillItem) => {
      setLines((prev) => {
        const found = prev.find((l) => l.itemId === item.id);
        if (found) {
          return prev.map((l) =>
            l.itemId === item.id ? { ...l, qty: String((parseQty(l.qty) ?? 0) + 1) } : l
          );
        }
        return [...prev, { itemId: item.id, qty: "1", rate: String(item.sale_price) }];
      });
      setItemQuery("");
      setActiveHit(0);
      setError(null);
      itemInputRef.current?.focus();
    },
    []
  );

  /** Called when a hand-typed item has just been saved to inventory. Adds it to the bill and flags the line. */
  const handleManualItemAdded = useCallback(
    (item: BillItem) => {
      setExtraStock((prev) => [...prev, item]);
      setNewItemIds((prev) => new Set(prev).add(item.id));
      addItem(item);
      setAddingItem(false);
      setToast("Added to inventory and to this bill.");
    },
    [addItem]
  );

  const setLine = (itemId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  const removeLine = (itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
    setReplacements((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };
  const stepQty = (l: Line, delta: number) => {
    const next = Math.max(1, (parseQty(l.qty) ?? 1) + delta);
    setLine(l.itemId, { qty: String(next) });
  };

  /* ---------- Replacement (old battery taken in exchange) ---------- */
  const addReplacement = (itemId: string, item: BillItem, currentQty: string) =>
    setReplacements((prev) => ({
      ...prev,
      [itemId]: {
        brand: item.brand,
        model: item.model,
        batteryType: item.type ?? "",
        batteryNumber: "",
        qty: parseQty(currentQty) != null ? currentQty : "1",
        weight: "",
        note: "",
      },
    }));
  const removeReplacement = (itemId: string) =>
    setReplacements((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  const setReplacementField = (itemId: string, patch: Partial<Replacement>) =>
    setReplacements((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], ...patch } } : prev));

  /* ---------- Totals (always calculated in code) ---------- */
  const computed = lines.map((l) => {
    const item = byId.get(l.itemId)!;
    const qty = parseQty(l.qty);
    const rate = parseAmount(l.rate);
    return {
      line: l,
      item,
      qty,
      rate,
      amount: qty != null && rate != null ? lineAmount(qty, rate) : 0,
      overStock: qty != null && qty > item.quantity,
      changed: rate != null && rate !== item.sale_price,
      belowCost: rate != null && rate < item.cost_price,
    };
  });
  const subtotal = round2(computed.reduce((s, c) => s + c.amount, 0));

  /* ---------- FBR: tick, tax, buyer details ----------
   * Every bill defaults to NOT an FBR bill, whatever it contains. Only the Owner can turn the
   * tick on, one bill at a time -- there is no automatic tick and nothing is logged when it is
   * left off. This is a deliberate shop policy, not the app deciding for you. */
  const fbrBill = fbrSettings.enabled && isOwner && (fbrTick ?? false);
  const taxInputs: TaxLineInput[] = computed
    .filter((c) => c.qty != null && c.rate != null)
    .map((c) => ({
      name: `${c.item.brand} ${c.item.model}`,
      saleType: c.item.sale_type ?? null,
      rateDesc: c.item.is_taxable === false ? "Exempt" : c.item.fbr_rate_desc ?? null,
      qty: c.qty!,
      price: c.rate!,
      retailPrice: c.item.retail_price ?? null,
      sroScheduleNo: c.item.sro_schedule_no ?? null,
      sroItemSerialNo: c.item.sro_item_serial_no ?? null,
      pricesIncludeTax: fbrSettings.pricesIncludeTax,
    }));
  const taxSummary = fbrBill ? billTax(taxInputs) : null;
  const taxAdded = taxSummary ? taxSummary.taxAdded : 0;
  const taxInside = taxSummary ? round2(taxSummary.taxReported - taxSummary.taxAdded) : 0;
  const total = round2(subtotal + taxAdded);
  const provinceOptions = provinceRows.length > 0 ? provinceRows.map((r) => r.label ?? r.code) : FALLBACK_PROVINCES;
  const effectiveProvince = buyerProvince || customer?.province || fbrSettings.shopProvince || "";
  const effectiveAddress = buyerAddress.trim() || customer?.address || walkinAddress.trim() || "";

  const partValue = parseAmount(partText);
  const paidNow = mode === "full" ? total : mode === "credit" ? 0 : Math.min(partValue ?? 0, total);
  const due = round2(total - paidNow);

  /* ---------- Save ---------- */
  function problem(): string | null {
    if (lines.length === 0) return "Add at least one item to the bill.";
    for (const c of computed) {
      const name = `${c.item.brand} ${c.item.model}`;
      if (c.qty == null) return `Enter a quantity of 1 or more for ${name}.`;
      if (c.rate == null) return `Enter a valid price for ${name} (numbers only, up to 2 decimals).`;
      if (c.overStock) {
        return `Only ${c.item.quantity} of ${name} in stock. Lower the quantity to ${c.item.quantity} or less.`;
      }
      const rep = replacements[c.line.itemId];
      if (rep) {
        if (!rep.brand.trim() || !rep.model.trim()) {
          return `Enter the brand and model of the old battery taken in for ${name}, or remove that replacement.`;
        }
        if (parseQty(rep.qty) == null) {
          return `Enter a quantity of 1 or more for the old battery taken in for ${name}.`;
        }
        if (rep.weight.trim() !== "" && (parseAmount(rep.weight) == null || (parseAmount(rep.weight) ?? 0) <= 0)) {
          return `Enter a valid weight in kg for the old battery taken in for ${name}, or leave it blank.`;
        }
      }
    }
    if (fbrBill) {
      for (const c of computed) {
        if (!c.item.hs_code) {
          return `${c.item.brand} ${c.item.model} has no HS code. Add it in Inventory before making an FBR bill (FBR errors 0019, 0044).`;
        }
      }
      if (taxSummary && taxSummary.errors.length > 0) return taxSummary.errors[0];
      if (!effectiveProvince) return "Choose the buyer's province for the FBR bill (FBR error 0074).";
    }
    if (total <= 0) return "The bill total is zero. Check the prices.";
    if (mode === "part") {
      if (partValue == null || partValue <= 0) return "Enter how much the customer is paying now.";
      if (partValue >= total) return "That is the full amount. Choose Paid in full, or enter a smaller amount.";
    }
    if (due > 0 && !customer) {
      // Udhaar for someone who is not saved yet: the customer is created automatically when the bill is saved.
      if (!walkinName.trim()) return "Enter the customer's name. For udhaar, the customer is saved automatically with this bill.";
      const udhaarPhone = normalizePhone(walkinPhone);
      if (!udhaarPhone || !isValidPhone(udhaarPhone)) {
        return "Enter the customer's phone number (10 to 15 digits) so you can follow up the udhaar.";
      }
    }
    if (!invoiceDate) return "Choose the bill date.";
    if (invoiceDate > today) return "The bill date cannot be in the future.";
    if (!customer) {
      const phone = normalizePhone(walkinPhone);
      if (phone && !isValidPhone(phone)) {
        return "Enter a valid phone number for the customer, or leave it empty.";
      }
      const reg = cleanRegNo(walkinCnic);
      if (walkinRegType === "Registered" && !reg) {
        return "A registered customer needs a CNIC (13 digits) or an NTN (7 digits).";
      }
      if (reg && !/^\d{7}$|^\d{13}$/.test(reg)) {
        return "Use 13 digits for a CNIC or 7 digits for an NTN. Dashes are fine, other characters are not.";
      }
    }
    return null;
  }

  /**
   * A bill made while offline can't get its real "AK-000123" number -- that is
   * handed out by a database sequence, and generating one on the device could
   * collide with another device's next bill. Instead we save everything needed
   * to create it here, queue the exact same RPC call, and let the sync engine
   * run it for real (and hand it its real number) the moment we're back online.
   */
  async function saveOffline() {
    const localId = crypto.randomUUID();
    const now = new Date().toISOString();
    const buyerName = customer ? customer.name : walkinName.trim() || "Walk-in customer";
    const paymentStatus: PaymentStatus = paymentStatusFor(total, paidNow);

    const createInvoiceParams: Record<string, unknown> = {
      p_customer_id: customerId,
      p_walkin_name: customerId ? null : walkinName.trim() || null,
      p_note: note.trim() || null,
      p_invoice_date: invoiceDate,
      p_items: computed.map((c) => ({ inventory_id: c.item.id, quantity: c.qty, rate: c.rate })),
      p_paid: paidNow,
      p_method: method,
      p_walkin_phone: customerId ? null : normalizePhone(walkinPhone) || null,
      p_walkin_address: customerId ? null : walkinAddress.trim() || null,
      p_walkin_registration_type: customerId ? null : walkinRegType,
      p_walkin_cnic_or_ntn: customerId ? null : cleanRegNo(walkinCnic) || null,
    };
    if (fbrBill) {
      createInvoiceParams.p_buyer_province = effectiveProvince;
      createInvoiceParams.p_buyer_address = effectiveAddress || null;
      createInvoiceParams.p_created_offline = true;
    }

    const localInvoice: LocalInvoice = {
      id: localId,
      local_id: localId,
      pending: true,
      invoice_number: "Pending sync",
      invoice_type: "Sale Invoice",
      invoice_date: invoiceDate,
      customer_id: customerId,
      buyer_name: buyerName,
      buyer_registration_type: customer?.registration_type ?? walkinRegType,
      buyer_cnic_or_ntn: customer?.cnic_or_ntn ?? (cleanRegNo(walkinCnic) || null),
      buyer_address: customer ? null : walkinAddress.trim() || null,
      buyer_phone: customer?.phone ?? (normalizePhone(walkinPhone) || null),
      note: note.trim() || null,
      total_value: total,
      status: "Valid",
      payment_status: paymentStatus,
      created_at: now,
      paid_total: paidNow,
      due_total: due,
    };

    const items: InvoiceItem[] = computed.map((c) => ({
      id: crypto.randomUUID(),
      invoice_id: localId,
      inventory_id: c.item.id,
      description: `${c.item.brand} ${c.item.model}`,
      hs_code: c.item.hs_code ?? null,
      uom: c.item.uom ?? "Numbers, pieces, units",
      quantity: c.qty!,
      rate: c.rate!,
      value_excl_tax: c.amount,
      sales_tax: 0,
      total: c.amount,
    }));

    if (hasIndexedDb()) {
      await offlineDb.invoices.put(localInvoice);
      await offlineDb.invoice_items.bulkAdd(items);

      // Reflect the sale in the local stock count straight away, so Inventory
      // (and the item search on this same screen) shows accurate numbers even
      // before this bill has actually reached Supabase.
      for (const c of computed) {
        const cached = await offlineDb.inventory.get(c.item.id);
        if (cached) await offlineDb.inventory.put({ ...cached, quantity: Math.max(0, cached.quantity - c.qty!) });
      }

      await offlineDb.pending_sync.add({
        table_name: "rpc",
        rpc_name: fbrBill ? "create_fbr_bill" : "create_invoice",
        record_id: localId,
        action: "rpc",
        payload: createInvoiceParams,
        group_id: localId,
        created_at: now,
        synced: false,
      });

      const toRecord = computed.filter((c) => replacements[c.line.itemId]);
      for (const c of toRecord) {
        const rep = replacements[c.line.itemId];
        const weight = rep.weight.trim() ? parseAmount(rep.weight) : null;
        await offlineDb.pending_sync.add({
          table_name: "rpc",
          rpc_name: "record_scrap_intake",
          record_id: crypto.randomUUID(),
          action: "rpc",
          group_id: localId,
          payload: {
            p_invoice_id: `__LOCAL_INVOICE__:${localId}`,
            p_customer_id: customerId,
            p_customer_name: buyerName,
            p_brand: rep.brand.trim(),
            p_model: rep.model.trim(),
            p_battery_type: rep.batteryType.trim() || null,
            p_battery_number: rep.batteryNumber.trim() || null,
            p_quantity: parseQty(rep.qty),
            p_estimated_weight_kg: weight,
            p_note: rep.note.trim() || null,
            p_received_date: invoiceDate,
          },
          created_at: now,
          synced: false,
        });
      }
    }

    notifySyncListeners();
    void runSync(); // harmless if still offline -- it will just re-check and back off
  }

  async function save(thenPrint: boolean) {
    if (savingRef.current) return; // never save the same bill twice
    const found = problem();
    if (found) {
      setError(found);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const online = await checkRealConnectivity();
      if (!online && due > 0 && !customer) {
        setError("You are offline. To save an udhaar bill offline, choose a saved customer. A new customer can only be saved when you are online.");
        savingRef.current = false;
        setSaving(false);
        return;
      }
      if (!online) {
        await saveOffline();
        setToast(
          thenPrint
            ? "Bill saved on this device. Printing needs a connection -- it will be ready to print once this syncs."
            : "Bill saved on this device. It will get its official number once you're back online."
        );
        // Give the toast a moment on screen before leaving this page.
        setTimeout(() => router.push("/sales"), 1100);
        return;
      }

      const supabase = await getBrowserClient();

      // Udhaar for a new customer: find (by phone) or create the customer first, then bill them.
      // If the bill fails after this, a retry finds the same customer by phone, so no duplicate is made.
      let billCustomerId: string | null = customerId;
      if (due > 0 && !customerId) {
        const custPhone = normalizePhone(walkinPhone);
        const found = await supabase.from("customers").select("id").eq("phone", custPhone).limit(1).maybeSingle();
        if (found.error) {
          setError("Could not check the customer list. Check your connection and try again.");
          savingRef.current = false;
          setSaving(false);
          return;
        }
        if (found.data?.id) {
          billCustomerId = found.data.id as string;
        } else {
          const created = await supabase
            .from("customers")
            .insert({
              name: walkinName.trim(),
              phone: custPhone,
              address: walkinAddress.trim() || null,
              registration_type: walkinRegType,
              cnic_or_ntn: cleanRegNo(walkinCnic) || null,
            })
            .select("id")
            .single();
          if (created.error || !created.data?.id) {
            setError("The new customer could not be saved, so the bill was not saved. Please try again.");
            savingRef.current = false;
            setSaving(false);
            return;
          }
          billCustomerId = created.data.id as string;
        }
      }

      const billParams: Record<string, unknown> = {
        p_customer_id: billCustomerId,
        p_walkin_name: billCustomerId ? null : walkinName.trim() || null,
        p_note: note.trim() || null,
        p_invoice_date: invoiceDate,
        p_items: computed.map((c) => ({ inventory_id: c.item.id, quantity: c.qty, rate: c.rate })),
        p_paid: paidNow,
        p_method: method,
        p_walkin_phone: billCustomerId ? null : normalizePhone(walkinPhone) || null,
        p_walkin_address: billCustomerId ? null : walkinAddress.trim() || null,
        p_walkin_registration_type: billCustomerId ? null : walkinRegType,
        p_walkin_cnic_or_ntn: billCustomerId ? null : cleanRegNo(walkinCnic) || null,
      };
      let rpcName = "create_invoice";
      if (fbrBill) {
        rpcName = "create_fbr_bill";
        billParams.p_buyer_province = effectiveProvince;
        billParams.p_buyer_address = effectiveAddress || null;
        billParams.p_created_offline = false;
      }
      const { data, error: dbError } = await supabase.rpc(rpcName, billParams);
      if (dbError || !data) {
        setError(dbError ? friendlyInvoiceError(dbError) : "The bill was not saved. Please try again.");
        savingRef.current = false;
        setSaving(false);
        return;
      }

      // The bill is saved. Now hand over any old batteries taken in exchange to the scrap
      // pile. This is a separate table from invoices (see supabase/07_scrap_battery.sql), so
      // if one of these fails the bill itself is still safely saved -- we never re-run save()
      // here, since that would create a second bill.
      const toRecord = computed.filter((c) => replacements[c.line.itemId]);
      const goTo = thenPrint ? `/print/${data}?auto=1` : `/sales/${data}`;
      if (toRecord.length > 0) {
        const recordOne = (c: (typeof toRecord)[number]) => {
          const rep = replacements[c.line.itemId];
          const weight = rep.weight.trim() ? parseAmount(rep.weight) : null;
          return supabase.rpc("record_scrap_intake", {
            p_invoice_id: data,
            p_customer_id: billCustomerId,
            p_customer_name: customer ? customer.name : walkinName.trim() || "Walk-in customer",
            p_brand: rep.brand.trim(),
            p_model: rep.model.trim(),
            p_battery_type: rep.batteryType.trim() || null,
            p_battery_number: rep.batteryNumber.trim() || null,
            p_quantity: parseQty(rep.qty),
            p_estimated_weight_kg: weight,
            p_note: rep.note.trim() || null,
            p_received_date: invoiceDate,
          });
        };

        // Try each once, pairing each item with its own result so nothing depends on index order.
        const firstPass = await Promise.all(
          toRecord.map(async (c) => ({ c, ok: !(await recordOne(c)).error }))
        );
        let stillFailed = firstPass.filter((r) => !r.ok).map((r) => r.c);

        if (stillFailed.length > 0) {
          // One retry after a short pause covers the common transient case (a dropped connection
          // between the two calls) without risking a duplicate scrap row, since record_scrap_intake
          // is only retried here, never the bill save itself.
          await new Promise((r) => setTimeout(r, 900));
          const retryPass = await Promise.all(
            stillFailed.map(async (c) => ({ c, ok: !(await recordOne(c)).error }))
          );
          stillFailed = retryPass.filter((r) => !r.ok).map((r) => r.c);
        }

        if (stillFailed.length > 0) {
          console.error("Some replacement batteries could not be recorded to the scrap pile:", stillFailed);
          setScrapFailure({
            names: stillFailed.map((c) => `${c.item.brand} ${c.item.model}`),
            goTo,
          });
          savingRef.current = false;
          setSaving(false);
          return; // hold here so staff sees the warning before moving on to the receipt
        }
      }

      router.push(goTo);
    } catch {
      setError("The connection dropped, so we could not confirm the bill was saved. Open Sales and check before you save again.");
      savingRef.current = false;
      setSaving(false);
    }

  }

  // Ctrl+S saves (desktop)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const customerHits = useMemo(
    () => customers.filter((c) => customerMatches({ ...c, address: null }, customerQuery)).slice(0, 6),
    [customers, customerQuery]
  );

  function onItemKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveHit((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveHit((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activeHit]) addItem(hits[activeHit]);
    }
  }

  const itemCount = lines.length;

  return (
    <div className="pb-44 lg:pb-0">
      <PageHeader
        title="New bill"
        subtitle="Choose a customer, add items, then save."
        action={
          <button
            type="button"
            role="switch"
            aria-checked={fbrBill}
            disabled={!fbrSettings.enabled || !isOwner}
            onClick={() => setFbrTick(!fbrBill)}
            className={`flex min-h-16 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              fbrBill ? "border-emerald-600 bg-emerald-50" : "border-line bg-white"
            }`}
          >
            <span
              aria-hidden="true"
              className={`relative inline-block h-9 w-16 shrink-0 rounded-full transition-colors ${fbrBill ? "bg-emerald-600" : "bg-gray-300"}`}
            >
              <span
                className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${fbrBill ? "left-8" : "left-1"}`}
              />
            </span>
            <span>
              <span className="block font-display text-xl font-bold leading-tight">
                FBR bill: {fbrBill ? "ON" : "OFF"}
              </span>
              <span className="block text-sm text-lead">
                {!fbrSettings.enabled
                  ? "FBR is switched off in the shop profile"
                  : !isOwner
                    ? "Only the Owner can use this"
                    : fbrBill
                      ? "This bill will be reported to FBR"
                      : "This bill will NOT go to FBR"}
              </span>
            </span>
          </button>
        }
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="space-y-4">
          {/* ---------- Customer ---------- */}
          <section className="card anim-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Customer</h2>
              <div className="flex items-center gap-2">
                <label htmlFor="invoice-date" className="text-sm font-medium text-lead">
                  Bill date
                </label>
                <input
                  id="invoice-date"
                  type="date"
                  value={invoiceDate}
                  max={today}
                  onChange={(e) => {
                    setInvoiceDate(e.target.value);
                    setError(null);
                  }}
                  className="input h-10 w-[9.5rem] tabular-nums"
                />
              </div>
              {!pickingCustomer && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPickingCustomer(true)}>
                  {customer ? "Change" : "Choose customer"}
                </button>
              )}
            </div>

            {!pickingCustomer && (
              <div className="mt-3">
                {customer ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={customer.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{customer.name}</p>
                      <p className="truncate text-sm text-lead">
                        {customer.phone ? formatPhone(customer.phone) : "No phone saved"}
                        {customer.registration_type === "Registered" && customer.cnic_or_ntn
                          ? ` · ${formatRegNo(customer.cnic_or_ntn)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="walkin" className="text-sm font-medium text-lead">
                      Walk-in customer. Name on bill{due > 0 ? " (needed for udhaar)" : " (optional)"}
                    </label>
                    <input
                      id="walkin"
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      maxLength={120}
                      placeholder="Leave empty for Walk-in customer"
                      className="input mt-1.5"
                      autoComplete="off"
                    />

                    <div className="mt-3">
                      <label htmlFor="walkin-phone" className="mb-1 block text-sm font-medium text-lead">
                        Phone{due > 0 ? " (needed for udhaar)" : " (optional)"}
                      </label>
                      <input
                        id="walkin-phone"
                        type="tel"
                        inputMode="tel"
                        value={walkinPhone}
                        onChange={(e) => {
                          setWalkinPhone(e.target.value);
                          setError(null);
                        }}
                        placeholder="0300 1234567"
                        className="input"
                        autoComplete="off"
                      />
                    </div>
                    <div className="mt-3">
                      <label htmlFor="walkin-address" className="mb-1 block text-sm font-medium text-lead">
                        Address (optional)
                      </label>
                      <textarea
                        id="walkin-address"
                        rows={2}
                        value={walkinAddress}
                        onChange={(e) => setWalkinAddress(e.target.value)}
                        placeholder="Shop or house number, area, city"
                        className="input resize-none"
                        autoComplete="off"
                      />
                    </div>

                    {!walkinDetailsOpen ? (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm mt-2.5"
                        onClick={() => setWalkinDetailsOpen(true)}
                      >
                        <Icon name="userplus" className="h-4 w-4" /> Add CNIC/NTN
                      </button>
                    ) : (
                      <div className="mt-3 space-y-3 rounded-xl border border-line p-3.5">
                        <p className="text-xs text-lead">
                          This goes straight on this bill. It is not saved as a customer record.
                        </p>
                        <div role="radiogroup" aria-label="Registration type" className="grid grid-cols-2 gap-2 rounded-2xl bg-plate p-1.5">
                          {REGISTRATION_TYPES.map((r) => {
                            const on = walkinRegType === r.value;
                            return (
                              <button
                                key={r.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => {
                                  setWalkinRegType(r.value);
                                  setError(null);
                                }}
                                className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition-all ${
                                  on ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                                }`}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                        <div>
                          <label htmlFor="walkin-cnic" className="mb-1 block text-sm font-medium text-lead">
                            CNIC or NTN {walkinRegType === "Registered" ? "" : "(optional)"}
                          </label>
                          <input
                            id="walkin-cnic"
                            type="text"
                            inputMode="numeric"
                            value={walkinCnic}
                            onChange={(e) => {
                              setWalkinCnic(e.target.value);
                              setError(null);
                            }}
                            placeholder="42101-1234567-1 or 1234567"
                            className="input tabular-nums"
                            autoComplete="off"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => {
                            setWalkinDetailsOpen(false);
                            setWalkinRegType("Unregistered");
                            setWalkinCnic("");
                          }}
                        >
                          Remove CNIC/NTN
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {pickingCustomer && (
              <div className="mt-3">
                <label className="relative block">
                  <span className="sr-only">Search customers</span>
                  <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
                  <input
                    autoFocus
                    type="search"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search name or phone"
                    className="input pl-11"
                    autoComplete="off"
                  />
                </label>
                <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(null);
                        setPickingCustomer(false);
                        setCustomerQuery("");
                      }}
                      className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-plate"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-casing/10 text-casing">
                        <Icon name="users" className="h-4 w-4" />
                      </span>
                      <span className="font-semibold">Walk-in customer</span>
                    </button>
                  </li>
                  {customerHits.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setPickingCustomer(false);
                          setCustomerQuery("");
                          setError(null);
                        }}
                        className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-plate"
                      >
                        <Avatar name={c.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.name}</span>
                          <span className="block truncate text-sm text-lead">{c.phone ? formatPhone(c.phone) : "No phone saved"}</span>
                        </span>
                        {c.registration_type === "Registered" && (
                          <span className="rounded-full bg-cell/10 px-2.5 py-1 text-xs font-semibold text-cell-deep">Registered</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {customerQuery.trim() && customerHits.length === 0 && (
                  <p className="mt-2 text-sm text-lead">No customer found. You can add them below.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAddingCustomer(true)}>
                    <Icon name="userplus" className="h-4 w-4" /> Add new customer
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPickingCustomer(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="note" className="text-sm font-medium text-lead">
                Vehicle or note (optional)
              </label>
              <input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="For example: Suzuki Cultus, old battery taken"
                className="input mt-1.5"
                autoComplete="off"
              />
            </div>
          </section>

          {/* ---------- Items ---------- */}
          <section className="card anim-rise p-4 sm:p-5" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Items</h2>
              {canAddManualItem && (
<button type="button" className="btn btn-quiet btn-sm" onClick={() => setAddingItem(true)}>
                <Icon name="plus" className="h-4 w-4" /> Item not in stock
              </button>
)}
            </div>

            <div className="relative mt-3">
              <label htmlFor="item-search" className="sr-only">
                Search stock to add
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                id="item-search"
                ref={itemInputRef}
                value={itemQuery}
                onChange={(e) => {
                  setItemQuery(e.target.value);
                  setActiveHit(0);
                }}
                onKeyDown={onItemKey}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="item-hits"
                aria-activedescendant={hits[activeHit] ? `hit-${hits[activeHit].id}` : undefined}
                placeholder="Search stock: brand, model, 100Ah"
                autoComplete="off"
                spellCheck={false}
                className="input pl-11"
              />
            </div>

            {itemQuery.trim() && (
              <ul id="item-hits" role="listbox" aria-label="Matching stock" className="mt-2 divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
                {hits.length === 0 && <li className="px-3.5 py-3 text-lead">No stock matches. Check the spelling.</li>}
                {hits.map((s, i) => (
                  <li key={s.id} role="option" id={`hit-${s.id}`} aria-selected={i === activeHit}>
                    <button
                      type="button"
                      onClick={() => addItem(s)}
                      onMouseMove={() => setActiveHit(i)}
                      className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left ${i === activeHit ? "bg-plate" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {s.brand} {s.model}
                        </span>
                        <span className="block truncate text-sm text-lead">{specText(s)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatRs(s.sale_price)}</span>
                        <span className={`block text-xs ${s.quantity <= 0 ? "font-semibold text-terminal-deep" : "text-lead"}`}>
                          {s.quantity <= 0 ? "Out of stock" : `${s.quantity} in stock`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {lines.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-lead/40 px-4 py-8 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
                  <Icon name="battery" className="h-6 w-6" />
                </span>
                <p className="mt-2 font-semibold">No items yet</p>
                <p className="mt-0.5 text-sm text-lead">
                  {allStock.length === 0
                    ? "Add stock in Inventory, or use \"Item not in stock\" above."
                    : "Search above and press Enter or tap an item to add it."}
                </p>
              </div>
            ) : (
              /* Laid out like the paper bill pad: Particulars / Qty / Rate / Amount columns, so it
               * reads the same way staff already read a handwritten bill. Scrolls sideways on a
               * narrow phone rather than squeezing the columns unreadably thin. */
              <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[38rem] border-collapse text-[15px]">
                  <thead>
                    <tr className="bg-plate/70 text-left">
                      <th className="border-b border-line px-3 py-2.5 font-display text-base font-semibold">Particulars</th>
                      <th className="w-28 border-b border-line px-2 py-2.5 text-center font-display text-base font-semibold">Qty</th>
                      <th className="w-28 border-b border-line px-2 py-2.5 text-right font-display text-base font-semibold">Rate</th>
                      <th className="w-32 border-b border-line px-3 py-2.5 text-right font-display text-base font-semibold">Amount</th>
                      <th className="w-10 border-b border-line" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {computed.map((c) => (
                      <Fragment key={c.line.itemId}>
                        <tr className={c.overStock ? "bg-terminal/5" : undefined}>
                          <td className="min-w-[11rem] px-3 py-2.5 align-top">
                            <p className="break-words font-semibold leading-snug">
                              {c.item.brand} {c.item.model}
                            </p>
                            <p className="text-sm text-lead">{specText(c.item)}</p>
                            {newItemIds.has(c.line.itemId) && (
                              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-cell/10 px-2 py-0.5 text-xs font-semibold text-cell-deep">
                                <Icon name="check" className="h-3 w-3" strokeWidth={2.4} /> New item, added to inventory
                              </p>
                            )}
                            {c.overStock && (
                              <p role="alert" className="mt-1 text-sm font-semibold text-terminal-deep">
                                Only {c.item.quantity} in stock. Lower the quantity to save.
                              </p>
                            )}
                            {!c.overStock && c.changed && (
                              <p className="mt-1 text-sm text-amber-800">Price changed from {formatRs(c.item.sale_price)}</p>
                            )}
                            {c.belowCost && <p className="mt-0.5 text-sm font-semibold text-terminal-deep">Below cost price</p>}
                            {c.item.category === "battery" &&
                              (!replacements[c.line.itemId] ? (
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-sm mt-2"
                                  onClick={() => addReplacement(c.line.itemId, c.item, c.line.qty)}
                                >
                                  <Icon name="swap" className="h-4 w-4" /> Old battery taken in exchange
                                </button>
                              ) : (
                                <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-casing">
                                  <Icon name="swap" className="h-4 w-4" /> Old battery taken in exchange
                                  <button
                                    type="button"
                                    className="font-medium text-lead hover:text-terminal-deep hover:underline"
                                    onClick={() => removeReplacement(c.line.itemId)}
                                  >
                                    Remove
                                  </button>
                                </p>
                              ))}
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <div className="mx-auto flex w-fit items-center">
                              <button
                                type="button"
                                onClick={() => stepQty(c.line, -1)}
                                aria-label={`One less ${c.item.brand} ${c.item.model}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-l-lg border border-line bg-white hover:bg-plate"
                              >
                                <Icon name="minus" className="h-3.5 w-3.5" />
                              </button>
                              <input
                                value={c.line.qty}
                                onChange={(e) => setLine(c.line.itemId, { qty: e.target.value.replace(/\D/g, "") })}
                                onFocus={(e) => e.target.select()}
                                inputMode="numeric"
                                aria-label={`Quantity of ${c.item.brand} ${c.item.model}`}
                                aria-invalid={c.qty == null}
                                className="input h-9 w-12 rounded-none border-x-0 px-1 text-center tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => stepQty(c.line, 1)}
                                aria-label={`One more ${c.item.brand} ${c.item.model}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-r-lg border border-line bg-white hover:bg-plate"
                              >
                                <Icon name="plus" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <label className="sr-only" htmlFor={`rate-${c.line.itemId}`}>
                              Rate for {c.item.brand} {c.item.model}
                            </label>
                            <input
                              id={`rate-${c.line.itemId}`}
                              value={c.line.rate}
                              onChange={(e) => setLine(c.line.itemId, { rate: e.target.value.replace(/[^\d.,]/g, "") })}
                              onFocus={(e) => e.target.select()}
                              inputMode="decimal"
                              aria-invalid={c.rate == null}
                              readOnly={!canOverridePrice}
                              title={canOverridePrice ? undefined : "Only the Owner can change prices"}
                              className={`input h-9 w-full text-right tabular-nums ${canOverridePrice ? "" : "bg-plate text-lead"}`}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right align-top font-display text-lg font-semibold tabular-nums">
                            {formatRs(c.amount)}
                          </td>
                          <td className="px-1 py-2.5 align-top">
                            <button
                              type="button"
                              onClick={() => removeLine(c.line.itemId)}
                              aria-label={`Remove ${c.item.brand} ${c.item.model}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lead hover:bg-terminal/10 hover:text-terminal"
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {c.item.category === "battery" && replacements[c.line.itemId] && (
                          <tr>
                            <td colSpan={5} className="bg-plate/50 px-3 py-3">
                              <p className="text-xs text-lead">Goes to the scrap pile, not back into sellable stock.</p>
                              <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                <div className="col-span-1">
                                  <label htmlFor={`rep-brand-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Brand
                                  </label>
                                  <input
                                    id={`rep-brand-${c.line.itemId}`}
                                    value={replacements[c.line.itemId].brand}
                                    onChange={(e) => setReplacementField(c.line.itemId, { brand: e.target.value })}
                                    aria-invalid={!replacements[c.line.itemId].brand.trim()}
                                    className="input h-10"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label htmlFor={`rep-model-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Model
                                  </label>
                                  <input
                                    id={`rep-model-${c.line.itemId}`}
                                    value={replacements[c.line.itemId].model}
                                    onChange={(e) => setReplacementField(c.line.itemId, { model: e.target.value })}
                                    aria-invalid={!replacements[c.line.itemId].model.trim()}
                                    className="input h-10"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label htmlFor={`rep-type-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Type (optional)
                                  </label>
                                  <input
                                    id={`rep-type-${c.line.itemId}`}
                                    list="rep-battery-types"
                                    value={replacements[c.line.itemId].batteryType}
                                    onChange={(e) => setReplacementField(c.line.itemId, { batteryType: e.target.value })}
                                    placeholder="Unknown"
                                    className="input h-10"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label htmlFor={`rep-qty-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Qty
                                  </label>
                                  <input
                                    id={`rep-qty-${c.line.itemId}`}
                                    value={replacements[c.line.itemId].qty}
                                    onChange={(e) =>
                                      setReplacementField(c.line.itemId, { qty: e.target.value.replace(/\D/g, "") })
                                    }
                                    inputMode="numeric"
                                    aria-invalid={parseQty(replacements[c.line.itemId].qty) == null}
                                    className="input h-10 tabular-nums"
                                  />
                                </div>
                              </div>
                              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                                <div>
                                  <label htmlFor={`rep-number-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Serial / plate number (optional)
                                  </label>
                                  <input
                                    id={`rep-number-${c.line.itemId}`}
                                    value={replacements[c.line.itemId].batteryNumber}
                                    onChange={(e) => setReplacementField(c.line.itemId, { batteryNumber: e.target.value })}
                                    className="input h-10"
                                  />
                                </div>
                                <div>
                                  <label htmlFor={`rep-weight-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                    Weight in kg (optional)
                                  </label>
                                  <input
                                    id={`rep-weight-${c.line.itemId}`}
                                    inputMode="decimal"
                                    value={replacements[c.line.itemId].weight}
                                    onChange={(e) => setReplacementField(c.line.itemId, { weight: e.target.value })}
                                    aria-invalid={
                                      replacements[c.line.itemId].weight.trim() !== "" &&
                                      (parseAmount(replacements[c.line.itemId].weight) == null ||
                                        (parseAmount(replacements[c.line.itemId].weight) ?? 0) <= 0)
                                    }
                                    placeholder="Usually weighed together at sale time"
                                    className="input h-10 tabular-nums"
                                  />
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <label htmlFor={`rep-note-${c.line.itemId}`} className="mb-1 block text-xs text-lead">
                                  Note (optional)
                                </label>
                                <input
                                  id={`rep-note-${c.line.itemId}`}
                                  value={replacements[c.line.itemId].note}
                                  onChange={(e) => setReplacementField(c.line.itemId, { note: e.target.value })}
                                  placeholder="Condition, etc."
                                  className="input h-10"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <datalist id="rep-battery-types">
                  {BATTERY_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Bill total and payment ---------- */}
        <aside className="card anim-rise p-4 sm:p-5 lg:sticky lg:top-20" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">Bill total</h2>

          <dl className="mt-3 space-y-1.5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-lead">Items</dt>
              <dd className="tabular-nums">{itemCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Subtotal</dt>
              <dd className="tabular-nums">{formatRs(subtotal)}</dd>
            </div>
            {fbrBill ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-lead">GST added</dt>
                  <dd className="tabular-nums">{formatRs(taxAdded)}</dd>
                </div>
                {taxInside > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-lead">GST already in printed price</dt>
                    <dd className="tabular-nums text-lead">{formatRs(taxInside)}</dd>
                  </div>
                )}
              </>
            ) : null}
          </dl>

          {fbrBill && (
            <div className="mt-3 rounded-xl border border-line bg-plate p-3">
              {fbrSettings.environment === "sandbox" && fbrBill && (
                <p className="mt-2 rounded-lg bg-white px-2 py-1 text-sm text-lead">Test mode: this bill goes to the FBR sandbox, not the real FBR.</p>
              )}

              {fbrBill && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label htmlFor="fbr-province" className="mb-1 block text-sm font-medium">
                      Buyer province
                    </label>
                    <select
                      id="fbr-province"
                      className="input"
                      value={effectiveProvince}
                      onChange={(e) => setBuyerProvince(e.target.value)}
                    >
                      <option value="">Choose the province</option>
                      {provinceOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      {effectiveProvince && !provinceOptions.includes(effectiveProvince) && (
                        <option value={effectiveProvince}>{effectiveProvince}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fbr-address" className="mb-1 block text-sm font-medium">
                      Buyer address
                    </label>
                    <input
                      id="fbr-address"
                      type="text"
                      className="input"
                      autoComplete="off"
                      value={buyerAddress}
                      placeholder={effectiveAddress || "Shop address is used if left empty"}
                      onChange={(e) => setBuyerAddress(e.target.value)}
                    />
                  </div>
                  {lines.some((l) => isThirdSchedule(byId.get(l.itemId)?.sale_type)) && (
                    <p className="text-sm text-lead">
                      Batteries: the customer pays the printed price. The FBR tax is worked out on the printed retail price.
                    </p>
                  )}
                </div>
              )}

              {fbrBill && taxSummary && taxSummary.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-terminal-deep">
                  {taxSummary.errors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-display text-xl font-semibold">Total</span>
            <span className="font-display text-4xl font-bold tabular-nums">{formatRs(total)}</span>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-lead">How is the customer paying?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PAY_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => {
                    setMode(m.value);
                    setError(null);
                  }}
                  className={`min-h-12 rounded-xl border px-2 py-2 text-sm font-semibold leading-tight transition-colors ${
                    mode === m.value ? "border-casing bg-casing text-white" : "border-line bg-white text-casing hover:bg-plate"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-lead">{PAY_MODES.find((m) => m.value === mode)?.hint}</p>
          </fieldset>

          {mode === "part" && (
            <div className="mt-3">
              <label htmlFor="part" className="text-sm font-medium text-lead">
                Paid now (Rs)
              </label>
              <input
                id="part"
                value={partText}
                onChange={(e) => setPartText(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="input mt-1.5 tabular-nums"
              />
            </div>
          )}

          {paidNow > 0 && (
            <div className="mt-3">
              <label htmlFor="method" className="text-sm font-medium text-lead">
                Payment method
              </label>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="input mt-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <dl className="mt-4 space-y-1.5 rounded-xl bg-plate/70 p-3.5">
            <div className="flex justify-between">
              <dt className="text-lead">Paid now</dt>
              <dd className="font-semibold tabular-nums">{formatRs(paidNow)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Due (udhaar)</dt>
              <dd className={`font-display text-2xl font-semibold tabular-nums ${due > 0 ? "text-terminal-deep" : "text-cell-deep"}`}>
                {formatRs(due)}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-terminal/10 px-3 py-2.5 text-[15px] text-terminal-deep">
              {error}
            </p>
          )}

          <div className="mt-4 hidden flex-col gap-2 lg:flex">
            <button type="button" onClick={() => save(false)} disabled={saving} className="btn btn-primary">
              {saving ? "Saving" : "Save bill"}
            </button>
            <button type="button" onClick={() => save(true)} disabled={saving} className="btn btn-quiet">
              <Icon name="printer" className="h-5 w-5" /> Save and print
            </button>
            <p className="text-center text-xs text-lead">
              Press <kbd className="rounded border border-line bg-plate px-1.5 py-0.5">Ctrl</kbd> +{" "}
              <kbd className="rounded border border-line bg-plate px-1.5 py-0.5">S</kbd> to save
            </p>
          </div>

          <button type="button" onClick={() => save(true)} disabled={saving} className="btn btn-quiet mt-4 w-full lg:hidden">
            <Icon name="printer" className="h-5 w-5" /> Save and print
          </button>
        </aside>
      </div>

      {/* Phone: total and Save stay pinned above the tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line/70 bg-white/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-lead">
              {itemCount} {itemCount === 1 ? "item" : "items"}
              {due > 0 ? ` · ${formatRs(due)} due` : ""}
            </p>
            <p className="font-display text-2xl font-bold leading-none tabular-nums">{formatRs(total)}</p>
          </div>
          <button type="button" onClick={() => save(false)} disabled={saving} className="btn btn-primary min-w-32">
            {saving ? "Saving" : "Save bill"}
          </button>
        </div>
      </div>

      {addingCustomer && (
        <CustomerForm
          customer={null}
          others={customers}
          onClose={() => setAddingCustomer(false)}
          onSaved={(m) => {
            setAddingCustomer(false);
            setToast(`${m} Search for them to add to this bill.`);
            router.refresh();
          }}
        />
      )}

      {addingItem && <ManualItemForm onClose={() => setAddingItem(false)} onAdded={handleManualItemAdded} />}

      {scrapFailure && (
        <Sheet onClose={() => {}} labelledBy="scrap-failure-title" dismissable={false}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-line px-5 py-4">
              <h2 id="scrap-failure-title" className="font-display text-2xl font-bold text-terminal-deep">
                Bill saved — one thing to fix
              </h2>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
              <p>The bill itself saved fine and the customer's receipt is ready.</p>
              <p>
                But the old {scrapFailure.names.length === 1 ? "battery" : "batteries"} taken in exchange could not be
                recorded to the scrap pile after two tries:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {scrapFailure.names.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <p className="text-sm text-lead">
                Open the Scrap screen and add {scrapFailure.names.length === 1 ? "it" : "them"} by hand, or ask
                whoever set up the app to check the connection.
              </p>
            </div>
            <div className="border-t border-line bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  const goTo = scrapFailure.goTo;
                  setScrapFailure(null);
                  router.push(goTo);
                }}
                className="btn btn-primary w-full"
              >
                Continue to receipt
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {toast && (
        <p role="status" className="anim-pop fixed inset-x-4 bottom-40 z-[60] mx-auto w-fit max-w-sm rounded-full bg-casing px-4 py-2.5 text-center text-[15px] font-medium text-white shadow-lift lg:bottom-8">
          {toast}
        </p>
      )}
    </div>
  );
}
