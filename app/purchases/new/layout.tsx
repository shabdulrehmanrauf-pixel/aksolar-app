import RequirePage from "@/components/RequirePage";

export default function NewPurchaseLayout({ children }: { children: React.ReactNode }) {
  return <RequirePage path="/purchases/new">{children}</RequirePage>;
}
