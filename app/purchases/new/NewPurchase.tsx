"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { categoryLabel, itemSpecs, stockMatches } from "@/lib/inventory";
import { formatRs } from "@/lib/format";
import { parseAmount, parseQty, round2, todayKarachi } from "@/lib/invoices";
import {
  costChanged,
  friendlyPurchaseError,
  hasDuplicateProducts,
  lineAmount,
  MAX_PURCHASE_LINES,
  purchaseLinePayload,
  purchaseTotals,
  SUPPLIER_PAYMENT_METHODS,
  validatePurchaseHeader,
  validatePurchaseLine,
  type NewPurchaseItemDraft,
  type PurchaseLineDraft,
} from "@/lib/purchases";
import { supplierMatches } from "@/lib/suppliers";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { InventoryItem, SupplierBalance, SupplierPaymentMethod } from "@/lib/types";
import NewProductFields from "./NewProductFields";

export type PurchaseStockItem = Pick<
  InventoryItem,
  "id" | "category" | "brand" | "model" | "type" | "voltage" | "plates" | "ah_rating" | "wattage" | "cost_price" | "quantity"
>;

function specText(item: PurchaseStockItem) {
  return itemSpecs(item as InventoryItem) || categoryLabel(item.category);
}

function emptyLine(item: PurchaseStockItem): PurchaseLineDraft {
  return {
    inventory_id: item.id,
    new_item: null,
    display_name: `${item.brand} ${item.model}`,
    current_cost_price: item.cost_price,
    quantity: "1",
    unit_cost: String(item.cost_price ?? 0),
    keep_old_cost: false,
  };
}

export default function NewPurchase({
  stock,
  suppliers,
  initialSupplierId,
  initialItemId,
}: {
  stock: PurchaseStockItem[];
  suppliers: SupplierBalance[];
  initialSupplierId: string | null;
  initialItemId: string | null;
}) {
  const router = useRouter();
  const clientId = useRef(crypto.randomUUID());

  // ---------- Supplier ----------
  const initialSupplier = initialSupplierId ? (suppliers.find((s) => s.id === initialSupplierId) ?? null) : null;
  const [supplierId, setSupplierId] = useState<string | null>(initialSupplier?.id ?? null);
  const [supplierQuery, setSupplierQuery] = useState(initialSupplier?.name ?? "");
  const [supplierListOpen, setSupplierListOpen] = useState(false);
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierAddress, setNewSupplierAddress] = useState("");

  const supplierMatchesQuery = useMemo(
    () => (supplierQuery.trim() ? suppliers.filter((s) => supplierMatches(s, supplierQuery)).slice(0, 8) : suppliers.slice(0, 8)),
    [suppliers, supplierQuery]
  );
  const exactSupplierMatch = suppliers.some((s) => s.name.trim().toLowerCase() === supplierQuery.trim().toLowerCase());
  const selectedSupplier = supplierId ? suppliers.find((s) => s.id === supplierId) : null;
  const isNewSupplier = !supplierId && supplierQuery.trim().length > 0 && !exactSupplierMatch;

  function pickSupplier(s: SupplierBalance) {
    setSupplierId(s.id);
    setSupplierQuery(s.name);
    setSupplierListOpen(false);
  }
  function changeSupplierQuery(v: string) {
    setSupplierQuery(v);
    setSupplierId(null);
    setSupplierListOpen(true);
  }

  // ---------- Bill details ----------
  const [invoiceDate, setInvoiceDate] = useState(todayKarachi());
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [note, setNote] = useState("");

  // ---------- Lines ----------
  const initialItem = initialItemId ? stock.find((i) => i.id === initialItemId) : undefined;
  const [lines, setLines] = useState<PurchaseLineDraft[]>(initialItem ? [emptyLine(initialItem)] : []);
  const [productQuery, setProductQuery] = useState("");
  const [productListOpen, setProductListOpen] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);

  const usedIds = useMemo(() => new Set(lines.map((l) => l.inventory_id).filter(Boolean)), [lines]);
  const productMatches = useMemo(
    () => (productQuery.trim() ? stock.filter((i) => !usedIds.has(i.id) && stockMatches(i, productQuery)).slice(0, 8) : []),
    [stock, productQuery, usedIds]
  );

  function addLine(item: PurchaseStockItem) {
    setLines((prev) => [...prev, emptyLine(item)]);
    setProductQuery("");
    setProductListOpen(false);
  }
  function addNewProductLine(draft: NewPurchaseItemDraft, displayName: string) {
    setLines((prev) => [
      ...prev,
      {
        inventory_id: null,
        new_item: draft,
        display_name: displayName,
        current_cost_price: null,
        quantity: "1",
        unit_cost: draft.sale_price ? "" : "",
        keep_old_cost: false,
      },
    ]);
    setNewProductOpen(false);
  }
  function updateLine(idx: number, patch: Partial<PurchaseLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------- Totals ----------
  const parsedLines = lines.map((l) => ({
    quantity: parseQty(l.quantity) ?? 0,
    unit_cost: parseAmount(l.unit_cost) ?? 0,
  }));
  const [discount, setDiscount] = useState("");
  const [freight, setFreight] = useState("");
  const { subtotal, total } = purchaseTotals(parsedLines, round2(parseAmount(discount || "0") ?? 0), round2(parseAmount(freight || "0") ?? 0));

  // ---------- Payment ----------
  const [paidNow, setPaidNow] = useState("");
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(todayKarachi());
  const [bankName, setBankName] = useState("");

  // ---------- Validation & save ----------
  const [errors, setErrors] = useState<ReturnType<typeof validatePurchaseHeader>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, ReturnType<typeof validatePurchaseLine>>>({});
  const [duplicateError, setDuplicateError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!newSupplierPhone && !newSupplierAddress) return;
    if (supplierId || !isNewSupplier) {
      setNewSupplierPhone("");
      setNewSupplierAddress("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const header = validatePurchaseHeader({
      supplierId,
      newSupplierName: isNewSupplier ? supplierQuery : "",
      invoiceDate,
      lineCount: lines.length,
      subtotal,
      discount,
      paidNow,
      total,
      method,
      chequeNumber,
    });
    const lErrs: Record<number, ReturnType<typeof validatePurchaseLine>> = {};
    lines.forEach((l, i) => {
      const e2 = validatePurchaseLine(l);
      if (Object.keys(e2).length > 0) lErrs[i] = e2;
    });
    const dup = hasDuplicateProducts(lines);

    setErrors(header);
    setLineErrors(lErrs);
    setDuplicateError(dup);

    if (Object.keys(header).length > 0 || Object.keys(lErrs).length > 0 || dup) {
      setSaveError("Some fields need attention. They are marked in red.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setSaveError("Receiving stock needs a connection -- purchases are recorded online only, so quantities and cost update reliably. Try again once you're back online.");
      setSaving(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const payloadLines = lines.map((l, i) =>
        purchaseLinePayload({
          inventory_id: l.inventory_id,
          new_item: l.new_item,
          quantity: parsedLines[i].quantity,
          unit_cost: parsedLines[i].unit_cost,
          keep_old_cost: l.keep_old_cost,
        })
      );

      const { data, error } = await supabase.rpc("create_purchase", {
        p_client_id: clientId.current,
        p_supplier_id: supplierId,
        p_new_supplier_name: isNewSupplier ? supplierQuery.trim() : null,
        p_new_supplier_phone: isNewSupplier ? newSupplierPhone.trim() || null : null,
        p_new_supplier_address: isNewSupplier ? newSupplierAddress.trim() || null : null,
        p_supplier_invoice_number: supplierInvoiceNumber.trim() || null,
        p_invoice_date: invoiceDate,
        p_note: note.trim() || null,
        p_lines: payloadLines,
        p_discount: round2(parseAmount(discount || "0") ?? 0),
        p_freight: round2(parseAmount(freight || "0") ?? 0),
        p_paid_now: paidNow.trim() ? round2(parseAmount(paidNow) ?? 0) : 0,
        p_method: method,
        p_reference: reference.trim() || null,
        p_cheque_number: method === "cheque" ? chequeNumber.trim() || null : null,
        p_cheque_date: method === "cheque" ? chequeDate : null,
        p_bank_name: method === "cheque" ? bankName.trim() || null : null,
      });

      if (error) {
        setSaveError(friendlyPurchaseError(error));
        setSaving(false);
        return;
      }
      router.push(`/purchases/${data}`);
    } catch {
      setSaveError("The connection dropped partway through. Check Purchases before saving again, so stock isn't received twice.");
      setSaving(false);
    }
  }

  const showCheque = method === "cheque" && paidNow.trim() !== "" && (parseAmount(paidNow) ?? 0) > 0;

  return (
    <div>
      <PageHeader title="Receive stock" subtitle="Record a purchase bill from a supplier" />

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
        {/* Supplier */}
        <section className="card p-5">
          <h2 className="font-display text-xl font-semibold">Supplier</h2>
          <div className="relative mt-3">
            <label htmlFor="supplier-query" className="sr-only">
              Supplier
            </label>
            <input
              id="supplier-query"
              type="text"
              autoComplete="off"
              value={supplierQuery}
              onChange={(e) => changeSupplierQuery(e.target.value)}
              onFocus={() => setSupplierListOpen(true)}
              placeholder="Search or type a new supplier's name"
              aria-invalid={errors.supplier ? true : undefined}
              className="input"
            />
            {supplierListOpen && (supplierMatchesQuery.length > 0 || (supplierQuery.trim() && !exactSupplierMatch)) && (
              <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white shadow-lift">
                {supplierMatchesQuery.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => pickSupplier(s)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-plate">
                      <span>
                        <span className="block font-medium">{s.name}</span>
                        {s.phone && <span className="block text-sm text-lead">{s.phone}</span>}
                      </span>
                      {s.balance !== 0 && (
                        <span className={`text-sm font-semibold tabular-nums ${s.balance > 0 ? "text-terminal-deep" : "text-cell-deep"}`}>
                          {formatRs(Math.abs(s.balance))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {supplierQuery.trim() && !exactSupplierMatch && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setSupplierListOpen(false)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-focus hover:bg-plate"
                    >
                      <Icon name="plus" className="h-4 w-4" /> Add "{supplierQuery.trim()}" as a new supplier
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          {errors.supplier && <p className="mt-1.5 text-sm text-terminal-deep">{errors.supplier}</p>}

          {selectedSupplier && (
            <p className="mt-2 text-sm text-lead">
              {selectedSupplier.balance > 0
                ? `You currently owe ${formatRs(selectedSupplier.balance)}.`
                : selectedSupplier.balance < 0
                  ? `You have ${formatRs(-selectedSupplier.balance)} in advance with them.`
                  : "No balance owed either way."}
            </p>
          )}

          {isNewSupplier && (
            <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl bg-plate/60 p-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="new-sup-phone" className="mb-1.5 block text-sm font-medium">
                  Phone (optional)
                </label>
                <input id="new-sup-phone" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="new-sup-address" className="mb-1.5 block text-sm font-medium">
                  Address (optional)
                </label>
                <input id="new-sup-address" value={newSupplierAddress} onChange={(e) => setNewSupplierAddress(e.target.value)} className="input" />
              </div>
              <p className="text-sm text-lead sm:col-span-2">
                Saved as a new supplier when this bill is saved. Add their NTN/CNIC or an opening balance afterwards from the Suppliers page.
              </p>
            </div>
          )}
        </section>

        {/* Bill details */}
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="invoice-date" className="mb-1.5 block text-sm font-medium">
              Date
            </label>
            <input
              id="invoice-date"
              type="date"
              value={invoiceDate}
              max={todayKarachi()}
              onChange={(e) => setInvoiceDate(e.target.value)}
              aria-invalid={errors.invoice_date ? true : undefined}
              className="input"
            />
            {errors.invoice_date && <p className="mt-1 text-sm text-terminal-deep">{errors.invoice_date}</p>}
          </div>
          <div>
            <label htmlFor="supplier-inv-no" className="mb-1.5 block text-sm font-medium">
              Supplier's invoice number
            </label>
            <input
              id="supplier-inv-no"
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              placeholder="Optional, but helps avoid double entry"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="purchase-note" className="mb-1.5 block text-sm font-medium">
              Note
            </label>
            <input id="purchase-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="input" />
          </div>
        </section>

        {/* Lines */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Products</h2>
            <span className="text-sm text-lead">
              {lines.length}/{MAX_PURCHASE_LINES}
            </span>
          </div>

          {duplicateError && (
            <p role="alert" className="mt-2 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
              The same product is on this bill twice. Combine them into one line instead.
            </p>
          )}
          {errors.lines && <p className="mt-2 text-sm text-terminal-deep">{errors.lines}</p>}

          <ul className="mt-3 space-y-3">
            {lines.map((l, idx) => {
              const qty = parseQty(l.quantity) ?? 0;
              const cost = parseAmount(l.unit_cost) ?? 0;
              const lineErr = lineErrors[idx] ?? {};
              return (
                <li key={idx} className="rounded-2xl border border-line p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.display_name}</p>
                      {l.inventory_id ? (
                        <p className="text-sm text-lead">Currently in stock</p>
                      ) : (
                        <p className="text-sm text-focus">New product</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      aria-label={`Remove ${l.display_name}`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                    >
                      <Icon name="trash" className="h-[18px] w-[18px]" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`qty-${idx}`} className="mb-1 block text-xs font-medium text-lead">
                        Quantity
                      </label>
                      <input
                        id={`qty-${idx}`}
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        aria-invalid={lineErr.quantity ? true : undefined}
                        className="input"
                      />
                      {lineErr.quantity && <p className="mt-1 text-xs text-terminal-deep">{lineErr.quantity}</p>}
                    </div>
                    <div>
                      <label htmlFor={`cost-${idx}`} className="mb-1 block text-xs font-medium text-lead">
                        Cost per unit (Rs)
                      </label>
                      <input
                        id={`cost-${idx}`}
                        inputMode="decimal"
                        value={l.unit_cost}
                        onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                        aria-invalid={lineErr.unit_cost ? true : undefined}
                        className="input tabular-nums"
                      />
                      {lineErr.unit_cost && <p className="mt-1 text-xs text-terminal-deep">{lineErr.unit_cost}</p>}
                    </div>
                  </div>

                  {costChanged(l.current_cost_price, cost) && (
                    <label className="mt-2.5 flex items-center gap-2 text-sm text-lead">
                      <input
                        type="checkbox"
                        checked={l.keep_old_cost}
                        onChange={(e) => updateLine(idx, { keep_old_cost: e.target.checked })}
                        className="h-4 w-4"
                      />
                      Cost changed from {formatRs(l.current_cost_price ?? 0)} -- keep the old cost on this item instead
                    </label>
                  )}

                  <p className="mt-2.5 text-right text-sm font-semibold tabular-nums text-lead">{formatRs(lineAmount(qty, cost))}</p>
                </li>
              );
            })}
          </ul>

          {lines.length === 0 && (
            <p className="mt-3 rounded-xl bg-plate/60 px-3.5 py-3 text-sm text-lead">No products added yet.</p>
          )}

          <div className="relative mt-4">
            <label htmlFor="product-query" className="sr-only">
              Add a product
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="product-query"
              type="search"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                setProductListOpen(true);
              }}
              onFocus={() => setProductListOpen(true)}
              placeholder="Search stock to add a product"
              disabled={lines.length >= MAX_PURCHASE_LINES}
              className="input pl-11"
            />
            {productListOpen && productQuery.trim() && (
              <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white shadow-lift">
                {productMatches.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-lead">No matches in stock.</li>
                ) : (
                  productMatches.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => addLine(item)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-plate">
                        <span>
                          <span className="block font-medium">
                            {item.brand} {item.model}
                          </span>
                          <span className="block text-sm text-lead">
                            {specText(item)} · {item.quantity} in stock
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-lead">{formatRs(item.cost_price)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNewProductOpen(true)}
            disabled={lines.length >= MAX_PURCHASE_LINES}
            className="btn btn-quiet mt-2.5 w-full sm:w-auto"
          >
            <Icon name="plus" className="h-5 w-5" /> Add a product not in stock yet
          </button>
        </section>

        {/* Totals */}
        <section className="card space-y-3 p-5">
          <h2 className="font-display text-xl font-semibold">Totals</h2>
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-lead">Subtotal</span>
            <span className="tabular-nums">{formatRs(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="discount" className="mb-1.5 block text-sm font-medium">
                Discount (Rs)
              </label>
              <input id="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" aria-invalid={errors.discount ? true : undefined} className="input tabular-nums" />
              {errors.discount && <p className="mt-1 text-sm text-terminal-deep">{errors.discount}</p>}
            </div>
            <div>
              <label htmlFor="freight" className="mb-1.5 block text-sm font-medium">
                Freight (Rs)
              </label>
              <input id="freight" inputMode="decimal" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0" className="input tabular-nums" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="font-display text-lg font-semibold">Total</span>
            <span className="font-display text-2xl font-bold tabular-nums">{formatRs(total)}</span>
          </div>
        </section>

        {/* Payment */}
        <section className="card space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Payment (optional)</h2>
          <p className="-mt-1 text-sm text-lead">Leave blank to record this as fully on credit for now.</p>
          <div>
            <label htmlFor="paid-now" className="mb-1.5 block text-sm font-medium">
              Paid now (Rs)
            </label>
            <input id="paid-now" inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0" aria-invalid={errors.paid_now ? true : undefined} className="input tabular-nums" />
            {errors.paid_now && <p className="mt-1 text-sm text-terminal-deep">{errors.paid_now}</p>}
          </div>

          {paidNow.trim() !== "" && (parseAmount(paidNow) ?? 0) > 0 && (
            <>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Method</span>
                <div className="flex flex-wrap gap-2">
                  {SUPPLIER_PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      aria-pressed={method === m.value}
                      className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                        method === m.value ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {showCheque && (
                <div className="grid grid-cols-1 gap-3 rounded-2xl bg-plate/60 p-3.5 sm:grid-cols-3">
                  <div>
                    <label htmlFor="cheque-number" className="mb-1.5 block text-sm font-medium">
                      Cheque number
                    </label>
                    <input id="cheque-number" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} aria-invalid={errors.cheque_number ? true : undefined} className="input" />
                    {errors.cheque_number && <p className="mt-1 text-xs text-terminal-deep">{errors.cheque_number}</p>}
                  </div>
                  <div>
                    <label htmlFor="cheque-date" className="mb-1.5 block text-sm font-medium">
                      Cheque date
                    </label>
                    <input id="cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label htmlFor="bank-name" className="mb-1.5 block text-sm font-medium">
                      Bank
                    </label>
                    <input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="reference" className="mb-1.5 block text-sm font-medium">
                  Reference (optional)
                </label>
                <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID, receipt no., etc." className="input" />
              </div>
            </>
          )}
        </section>

        {saveError && (
          <p role="alert" className="rounded-xl bg-terminal/10 px-3.5 py-3 text-sm text-terminal-deep">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={() => router.back()} disabled={saving} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary min-w-40">
            {saving ? "Saving" : "Save purchase"}
          </button>
        </div>
      </form>

      {newProductOpen && <NewProductFields onClose={() => setNewProductOpen(false)} onAdd={addNewProductLine} />}
    </div>
  );
}
