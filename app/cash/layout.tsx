import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function CashLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/cash">{children}</RequirePage>
    </AppShell>
  );
}
