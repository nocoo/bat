import { AppShell } from "@/components/layout";
import { Server } from "lucide-react";

export default function HostsPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Hosts" }]}>
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Server className="h-12 w-12 mb-4" strokeWidth={1} />
        <h1 className="text-xl font-semibold text-foreground">Hosts</h1>
        <p className="mt-2 text-sm">Host monitoring will appear here.</p>
      </div>
    </AppShell>
  );
}
