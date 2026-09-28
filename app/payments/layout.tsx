import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/payments">{children}</RequirePage>
    </AppShell>
  );
}
