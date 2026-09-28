import RequirePage from "@/components/RequirePage";

export default function NewBillLayout({ children }: { children: React.ReactNode }) {
  return <RequirePage path="/sales/new">{children}</RequirePage>;
}
