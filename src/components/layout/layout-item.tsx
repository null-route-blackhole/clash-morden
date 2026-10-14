import {
  alpha,
  Box,
  ListItem,
  ListItemButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Cpu,
  House,
  Layers,
  ListFilter,
  Network,
  Palette,
  ScrollText,
  Settings,
  Wifi,
} from "lucide-react";
import { motion } from "motion/react";

import { useVergeStore } from "@/stores";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";

interface Props {
  to: string;
  children: string;
  icon: React.ReactNode[];
  sidebarCollapsed: boolean;
  sidebarLeftAligned?: boolean;
  pending?: boolean;
  onNavigate?: () => void;
  onMouseEnter?: () => void;
}
export const LayoutItem = (props: Props) => {
  const {
    to,
    children,
    icon,
    sidebarCollapsed,
    sidebarLeftAligned = false,
    pending = false,
    onNavigate,
    onMouseEnter,
  } = props;
  const modern = useInterfaceStyleStore(
    (s) => (s.preview ?? s.appearance).style !== "clash",
  );
  const configuredMenuIcon = useVergeStore(
    (s) => s.verge.menu_icon ?? "monochrome",
  );
  const menuIcon =
    modern && configuredMenuIcon !== "disable"
      ? "monochrome"
      : configuredMenuIcon;
  const NavIcon =
    (
      {
        "/": House,
        "/home": House,
        "/proxies": Wifi,
        "/profiles": Layers,
        "/connections": Network,
        "/rules": ListFilter,
        "/logs": ScrollText,
        "/test": Activity,
        "/style-test": Palette,
        "/kernel": Cpu,
        "/settings": Settings,
      } as Record<string, typeof House>
    )[to] ?? House;
  const matchRoute = useMatchRoute();
  const match = !!matchRoute({ to });
  const navigate = useNavigate();
  const enableMenuIcon = menuIcon && menuIcon !== "disable";

  return (
    <Tooltip
      title={enableMenuIcon && sidebarCollapsed ? children : null}
      placement="right">
      <ListItem
        className="interface-nav-item"
        sx={{
          boxSizing: "border-box",
          padding: sidebarCollapsed
            ? "2px 0"
            : sidebarLeftAligned
              ? "1px 0"
              : "4px 0",
          height: sidebarCollapsed
            ? "46px"
            : sidebarLeftAligned
              ? "46px"
              : "60px",
          minHeight: sidebarCollapsed
            ? "46px"
            : sidebarLeftAligned
              ? "46px"
              : "60px",
        }}>
        <ListItemButton
          className="interface-nav-button"
          selected={match || pending}
          sx={(theme) => {
            const color = theme.palette.primary.main;
            return {
              borderRadius:
                sidebarCollapsed || sidebarLeftAligned ? "10px" : "999px",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
              margin: sidebarCollapsed
                ? "0 4px"
                : sidebarLeftAligned
                  ? "0 8px"
                  : "0 10px",
              padding: sidebarCollapsed
                ? "4px"
                : sidebarLeftAligned
                  ? "6px"
                  : "8px 6px",
              height: "100%",
              minHeight: 0,
              "& .MuiListItemText-primary": {
                color: theme.palette.text.primary,
                fontWeight: "700",
              },
              "& .MuiListItemIcon-root": {
                color: theme.palette.text.primary,
              },
              // 涟漪效果颜色
              "& .MuiTouchRipple-root .MuiTouchRipple-rippleVisible": {
                color,
              },
              "&.Mui-selected": { bgcolor: alpha(color, 0.25) },
              ...theme.applyStyles("dark", {
                "&.Mui-selected": { bgcolor: alpha(color, 0.35) },
              }),
              "&.Mui-selected:hover": { bgcolor: alpha(color, 0.25) },
              ...theme.applyStyles("dark", {
                "&.Mui-selected:hover": { bgcolor: alpha(color, 0.35) },
              }),
              "&.Mui-selected .MuiListItemText-primary": { color },
              "&.Mui-selected .MuiListItemIcon-root": { color },
            };
          }}
          onClick={() => {
            onNavigate?.();
            navigate({ to });
          }}
          onMouseEnter={onMouseEnter}>
          <div
            className={`flex h-8 items-center gap-2.5 ${sidebarCollapsed ? "w-full justify-center" : "w-full justify-start"}`}
            style={{
              transform: sidebarCollapsed
                ? undefined
                : sidebarLeftAligned
                  ? "translateX(-2px)"
                  : undefined,
            }}>
            <motion.div layout>
              {enableMenuIcon && menuIcon === "monochrome" && (
                <Box
                  sx={{
                    color: match || pending ? "primary.main" : "text.primary",
                  }}>
                  {modern ? <NavIcon size={18} strokeWidth={1.65} /> : icon[0]}
                </Box>
              )}
              {enableMenuIcon && menuIcon === "colorful" && icon[1]}
            </motion.div>
            {(!sidebarCollapsed || !enableMenuIcon) && (
              <div className="min-w-0">
                <Typography
                  sx={{
                    color: match || pending ? "primary.main" : "text.primary",
                    fontWeight: "bold",
                  }}>
                  {children}
                </Typography>
              </div>
            )}
          </div>
        </ListItemButton>
      </ListItem>
    </Tooltip>
  );
};
