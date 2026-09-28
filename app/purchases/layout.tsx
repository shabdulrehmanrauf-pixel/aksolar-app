import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/purchases">{children}</RequirePage>
    </AppShell>
  );
}
