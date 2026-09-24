import type { Metadata } from "next";
import AssistantChat from "@/components/AssistantChat";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <PageHeader title="Assistant" subtitle="Ask about stock, sales or customers. Answers only for now — no changes." />
      <div className="mt-5 flex-1">
        <AssistantChat />
      </div>
    </div>
  );
}
