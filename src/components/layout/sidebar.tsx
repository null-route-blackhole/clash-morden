import { List, Paper } from "@mui/material";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LayoutTraffic } from "@/components/layout/layout-traffic";
import { LogoTitle } from "@/components/layout/logo-title";
import { useWindowSize } from "@/hooks/use-window-size";
import { routes } from "@/routes/__root";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useVergeStore } from "@/stores/vergeStore";
import { cn } from "@/utils";

import { LayoutItem } from "./layout-item";

interface Props {
  enableSystemTitleBar: boolean;
  onNavigateStart?: (to: string) => void;
}

export const Sidebar = (props: Props) => {
  const { enableSystemTitleBar, onNavigateStart } = props;
  const { size } = useWindowSize();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const sidebarMode = useSidebarStore((s) => s.mode);
  const sidebarCollapsed = sidebarMode === "collapsed" || size.width < 650;
  const sidebarLeftAligned = useVergeStore(
    (s) => s.verge.sidebar_left_aligned ?? false,
  );
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  useEffect(() => {
    setPendingTo(null);
  }, [pathname]);

  useEffect(() => {
    const preloadRoutes = () => {
      routes.forEach((route) => {
        void router.preloadRoute({ to: route.path });
      });
    };
    const windowWithIdleCallback = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (windowWithIdleCallback.requestIdleCallback) {
      const idleId = windowWithIdleCallback.requestIdleCallback(() => {
        preloadRoutes();
      });
      return () => windowWithIdleCallback.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadRoutes, 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router]);

  return (
    <Paper
      component="nav"
      elevation={0}
      sx={
        sidebarCollapsed
          ? {
              backgroundColor: "transparent",
              border: 0,
              boxShadow: "none",
              "&::before": {
                content: '""',
                position: "absolute",
                zIndex: 0,
                top: 0,
                bottom: 0,
                left: 4,
                right: 4,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                backgroundColor: "background.default",
                boxShadow: 1,
                pointerEvents: "none",
              },
              "& > *": { position: "relative", zIndex: 1 },
            }
          : undefined
      }
      className={cn(
        "relative flex shrink-0 grow-0 basis-40 flex-col border-t-0 border-r border-b-0 border-l-0 border-solid border-(--divider-color) pt-2 transition-all transition-none duration-300",
        {
          // 收起态做成悬浮 dock，避开顶部自定义标题栏，也不贯穿整个窗口。
          "my-3 h-[calc(100%-88px)] basis-12 self-center border-0 bg-transparent py-0 shadow-none":
            sidebarCollapsed,
          "pt-4": !enableSystemTitleBar,
        },
      )}>
      <LogoTitle sidebarCollapsed={sidebarCollapsed} />

      <List
        className={cn("box-border flex-auto overflow-y-auto", {
          "pt-3": sidebarLeftAligned && !sidebarCollapsed,
        })}>
        {routes.map((route) => (
          <LayoutItem
            sidebarCollapsed={sidebarCollapsed}
            sidebarLeftAligned={sidebarLeftAligned}
            key={route.label}
            to={route.path}
            icon={route.icon}
            pending={pendingTo === route.path}
            onMouseEnter={() => {
              void router.preloadRoute({ to: route.path });
            }}
            onNavigate={() => {
              onNavigateStart?.(route.path);
              setPendingTo(route.path);
            }}>
            {t(route.label)}
          </LayoutItem>
        ))}
      </List>

      <div
        className={cn(
          "flex shrink-0 grow-0 items-center justify-center px-4 py-2",
          { hidden: sidebarCollapsed },
        )}>
        <LayoutTraffic />
      </div>
    </Paper>
  );
};
