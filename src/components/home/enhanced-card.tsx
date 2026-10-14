import {
  alpha,
  Box,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Activity,
  ChartNoAxesCombined,
  Globe,
  Layers,
  Network,
  Server,
  Shield,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";

const cardIcons = {
  activity: Activity,
  chart: ChartNoAxesCombined,
  globe: Globe,
  layers: Layers,
  network: Network,
  server: Server,
  shield: Shield,
};

interface EnhancedCardProps {
  iconKind?: keyof typeof cardIcons;
  titleAction?: ReactNode;
  title: ReactNode;
  icon: ReactNode;
  action?: ReactNode;
  iconAction?: { label: string; onClick: () => void };
  children: ReactNode;
  iconColor?:
    "primary" | "secondary" | "error" | "warning" | "info" | "success";
  minHeight?: number | string;
  noContentPadding?: boolean;
  /** uppercase 小标题（zashboard 风格，默认）｜default 保留原始字重字号 */
  titleVariant?: "uppercase" | "default";
}

// 首页卡片通用外壳（标题栏 + 内容区），字体比例仿 zashboard：
// 12px 大写小标题 + 14px 正文
export const EnhancedCard = forwardRef<HTMLElement, EnhancedCardProps>(
  (
    {
      title,
      icon,
      iconKind,
      titleAction,
      action,
      iconAction,
      children,
      iconColor = "primary",
      minHeight,
      noContentPadding = false,
      titleVariant = "uppercase",
    },
    ref,
  ) => {
    const theme = useTheme();
    const modern = useInterfaceStyleStore(
      (s) => (s.preview ?? s.appearance).style !== "clash",
    );
    const ModernIcon = iconKind ? cardIcons[iconKind] : undefined;
    const headerIcon =
      modern && ModernIcon ? <ModernIcon size={16} strokeWidth={1.65} /> : icon;

    // 统一的标题截断样式
    const titleTruncateStyle = {
      minWidth: 0,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      display: "block",
    };

    return (
      <Box
        ref={ref}
        className="interface-card"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
          backgroundColor: "background.paper",
        }}>
        <Box
          className="interface-card-header"
          sx={{
            px: 2,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 0.75,
            borderBottom: 1,
            borderColor: "divider",
          }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              minWidth: 120,
              flex: 1,
              overflow: "hidden",
            }}>
            {iconAction ? (
              <Tooltip title={iconAction.label}>
                <IconButton
                  className="interface-title-icon"
                  size="small"
                  aria-label={iconAction.label}
                  onClick={iconAction.onClick}
                  sx={{
                    width: 26,
                    height: 26,
                    mr: 1,
                    flexShrink: 0,
                    color: "text.secondary",
                  }}>
                  {headerIcon}
                </IconButton>
              </Tooltip>
            ) : (
              <Box
                className="interface-title-icon"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 1.25,
                  width: modern ? 20 : 26,
                  height: modern ? 20 : 26,
                  mr: 1,
                  flexShrink: 0,
                  backgroundColor: modern
                    ? "transparent"
                    : alpha(theme.palette[iconColor].main, 0.12),
                  color: modern
                    ? "text.secondary"
                    : theme.palette[iconColor].main,
                }}>
                {headerIcon}
              </Box>
            )}
            <Box sx={{ minWidth: 0, flex: titleAction ? "0 1 auto" : 1 }}>
              {typeof title === "string" ? (
                <Typography
                  className="interface-card-title"
                  variant="h6"
                  title={title}
                  sx={
                    titleVariant === "uppercase"
                      ? {
                          ...titleTruncateStyle,
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "text.secondary",
                        }
                      : {
                          ...titleTruncateStyle,
                          fontWeight: "medium",
                          fontSize: 18,
                        }
                  }>
                  {title}
                </Typography>
              ) : (
                <Box sx={titleTruncateStyle}>{title}</Box>
              )}
            </Box>
            {titleAction && (
              <Box sx={{ ml: 1, flexShrink: 0 }}>{titleAction}</Box>
            )}
          </Box>
          {action && (
            <Box sx={{ ml: "auto", minWidth: 0, maxWidth: "100%" }}>
              {action}
            </Box>
          )}
        </Box>
        <Box
          className="interface-card-content"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            p: noContentPadding ? 0 : 1.75,
            fontSize: "0.875rem",
            ...(minHeight && { minHeight }),
          }}>
          {children}
        </Box>
      </Box>
    );
  },
);
