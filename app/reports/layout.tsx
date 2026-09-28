import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/reports">{children}</RequirePage>
    </AppShell>
  );
}
