import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/expenses">{children}</RequirePage>
    </AppShell>
  );
}
