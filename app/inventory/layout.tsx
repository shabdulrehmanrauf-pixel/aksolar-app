import AppShell from "@/components/AppShell";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
