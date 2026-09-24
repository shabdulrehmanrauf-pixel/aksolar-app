/**
 * Shapes shared by the server (lib/ai/proposals.ts) and the chat card
 * (components/AssistantProposalCard.tsx). Types only — no server code here, so
 * the browser can import it safely.
 *
 * A "proposal" is DATA, not prose: everything the card shows comes from one of
 * these objects, which the server built and validated from real inventory and
 * customer rows. The AI's own wording is never what gets confirmed.
 */
import type { CustomerFormValues } from "@/lib/customers";
import type { ItemFormValues } from "@/lib/inventory";
import type { PaymentMethod } from "@/lib/types";

/** How long a proposal can be confirmed for. Must match the interval in supabase/10_ai_actions.sql. */
export const PROPOSAL_MINUTES = 30;

export type BillProposal = {
  kind: "create_bill";
  /** Same bill asked twice => same fingerprint, so it is never proposed twice. */
  fingerprint: string;
  customer: { id: string | null; name: string; phone: string | null; saved: boolean };
  lines: {
    itemId: string;
    name: string;
    specs: string;
    qty: number;
    rate: number;
    listPrice: number;
    amount: number;
    priceChanged: boolean;
  }[];
  total: number;
  mode: "full" | "part" | "credit";
  paid: number;
  due: number;
  method: PaymentMethod;
  note: string | null;
  warnings: string[];
};

export type ItemProposal = {
  kind: "add_item";
  fingerprint: string;
  form: ItemFormValues;
  /** One readable line, e.g. "Tubular, 12 V, 200 Ah". */
  specs: string;
  warnings: string[];
};

export type CustomerProposal = {
  kind: "add_customer";
  fingerprint: string;
  form: CustomerFormValues;
  warnings: string[];
};

/** An old battery taken in on its own (not through a bill) — goes to the scrap pile. */
export type ScrapAddProposal = {
  kind: "add_scrap";
  fingerprint: string;
  brand: string;
  model: string;
  batteryType: string | null;
  batteryNumber: string | null;
  quantity: number;
  weightKg: number | null;
  customerName: string | null;
  receivedDate: string; // YYYY-MM-DD
  note: string | null;
  warnings: string[];
};

/** A bulk, weighed sale of scrap batches to a kabari / scrap buyer. */
export type ScrapSaleProposal = {
  kind: "sell_scrap";
  fingerprint: string;
  rows: { id: string; intakeNumber: string; name: string; qty: number }[];
  totalQty: number;
  buyerName: string;
  buyerPhone: string | null;
  weightKg: number;
  ratePerKg: number;
  total: number;
  saleDate: string; // YYYY-MM-DD
  note: string | null;
  warnings: string[];
};

/** Shared by the charging slip and the battery claim: a saved customer, or a walk-in. */
export type SlipCustomer = { id: string | null; name: string; phone: string | null; saved: boolean };

/** A customer's own battery dropped off to be charged. */
export type ChargingProposal = {
  kind: "create_charging";
  fingerprint: string;
  customer: SlipCustomer;
  brand: string;
  model: string;
  batteryNumber: string | null;
  price: number;
  receivedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD, shown for information; the database sets the real one
  note: string | null;
  warnings: string[];
};

/** A battery we sold, going back to its distributor under warranty. */
export type ClaimProposal = {
  kind: "create_claim";
  fingerprint: string;
  customer: SlipCustomer;
  brand: string;
  model: string;
  batteryNumber: string | null;
  originalInvoice: { id: string; number: string; date: string } | null;
  distributor: { id: string | null; name: string; isNew: boolean } | null;
  claimAmount: number | null;
  extraCharges: number | null;
  receivedDate: string; // YYYY-MM-DD
  note: string | null;
  warnings: string[];
};

export type Proposal =
  | BillProposal
  | ItemProposal
  | CustomerProposal
  | ScrapAddProposal
  | ScrapSaleProposal
  | ChargingProposal
  | ClaimProposal;

/** What the chat receives: the saved action's id plus the proposal to draw as a card. */
export type ProposalCard = { id: string; proposal: Proposal };

export type ActionDecision = "confirm" | "cancel" | "edit";

export type ActionResponse = {
  ok: boolean;
  message: string;
  link?: string;
  linkLabel?: string;
};
