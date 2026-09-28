import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/suppliers">{children}</RequirePage>
    </AppShell>
  );
}
