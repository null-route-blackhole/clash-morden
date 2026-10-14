import { Box, Paper, Typography } from "@mui/material";
import type { CSSProperties, ReactNode } from "react";

import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn } from "@/utils";
import { OS } from "@/utils/get-system";

import { BaseErrorBoundary } from "./base-error-boundary";

interface Props {
  title?: ReactNode; // the page title
  header?: ReactNode; // something behind title
  contentStyle?: CSSProperties;
  children?: ReactNode;
  full?: boolean;
}

export const BasePage: React.FC<Props> = (props) => {
  const { title, header, contentStyle, full, children } = props;
  const sidebarMode = useSidebarStore((s) => s.mode);
  const topbarOffset =
    OS === "macos"
      ? sidebarMode === "hidden"
        ? 70
        : sidebarMode === "collapsed"
          ? 24
          : 0
      : 0;

  return (
    <BaseErrorBoundary>
      <div className="interface-page flex h-full min-h-0 w-full flex-col">
        <div
          className="flex h-12.5 shrink-0 items-center justify-between"
          data-tauri-drag-region="deep"
          style={{
            userSelect: "none",
            paddingLeft: topbarOffset + 8,
            paddingRight: 8,
          }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              minWidth: 0,
            }}>
            <SidebarToggle />
            <Typography
              className="interface-page-title"
              sx={{
                fontSize: "20px",
                fontWeight: "700 ",
                cursor: "default",
                lineHeight: "24px",
              }}>
              {title}
            </Typography>
          </Box>

          {header}
        </div>

        <Paper className={"min-h-0 flex-1"} elevation={0}>
          <div
            className={cn(
              "bg-background-default h-full min-h-0 w-full overflow-auto",
              full ? "p-0" : "px-2",
            )}
            style={contentStyle}>
            {children}
          </div>
        </Paper>
      </div>
    </BaseErrorBoundary>
  );
};
