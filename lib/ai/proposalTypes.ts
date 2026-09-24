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

export type Proposal = BillProposal | ItemProposal | CustomerProposal;

/** What the chat receives: the saved action's id plus the proposal to draw as a card. */
export type ProposalCard = { id: string; proposal: Proposal };

export type ActionDecision = "confirm" | "cancel" | "edit";

export type ActionResponse = {
  ok: boolean;
  message: string;
  link?: string;
  linkLabel?: string;
};
