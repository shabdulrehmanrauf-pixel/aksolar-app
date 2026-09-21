import AppShell from "@/components/AppShell";

export default function MoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
