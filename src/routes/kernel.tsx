import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import type { KernelTab } from "@/components/kernel/schema";

const KernelPage = lazy(() => import("@/pages/kernel"));
const tabs: KernelTab[] = ["general", "network", "dns", "tun", "sniffer"];
function KernelRouteComponent() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <KernelPage
      tab={tab}
      onTabChange={(tab) => {
        void navigate({ search: { tab } });
      }}
    />
  );
}
export const Route = createFileRoute("/kernel")({
  component: KernelRouteComponent,
  validateSearch: (search: Record<string, unknown>): { tab: KernelTab } => ({
    tab: tabs.includes(search.tab as KernelTab)
      ? (search.tab as KernelTab)
      : "general",
  }),
});
