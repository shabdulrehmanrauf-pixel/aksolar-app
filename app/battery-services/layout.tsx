import AppShell from "@/components/AppShell";
import RequirePage from "@/components/RequirePage";

export default function BatteryServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RequirePage path="/battery-services">{children}</RequirePage>
    </AppShell>
  );
}
