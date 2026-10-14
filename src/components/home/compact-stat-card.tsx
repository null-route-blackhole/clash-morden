import {
  alpha,
  Grid,
  type PaletteColor,
  Paper,
  Typography,
  useTheme,
} from "@mui/material";
import { memo, type ReactNode, useMemo } from "react";

export interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: string | number;
  unit: string;
  color: "primary" | "secondary" | "error" | "warning" | "info" | "success";
  accentColor?: string;
  onClick?: () => void;
}

// 统计 tile（流量/连接/内存等数值卡共用）
export const CompactStatCard = memo(
  ({
    icon,
    title,
    value,
    unit,
    color,
    accentColor,
    onClick,
  }: StatCardProps) => {
    const theme = useTheme();

    const colorValue = useMemo(() => {
      if (accentColor) return accentColor;
      const palette = theme.palette;
      if (
        color in palette &&
        palette[color as keyof typeof palette] &&
        "main" in (palette[color as keyof typeof palette] as PaletteColor)
      ) {
        return (palette[color as keyof typeof palette] as PaletteColor).main;
      }
      return palette.primary.main;
    }, [theme.palette, color, accentColor]);

    return (
      <Paper
        className="interface-metric"
        elevation={0}
        onClick={onClick}
        sx={{
          display: "flex",
          alignItems: "center",
          borderRadius: 2,
          bgcolor: alpha(colorValue, 0.05),
          border: `1px solid ${alpha(colorValue, 0.15)}`,
          padding: "4px 8px",
          transition: "all 0.2s ease-in-out",
          cursor: onClick ? "pointer" : "default",
          "&:hover": onClick
            ? {
                bgcolor: alpha(colorValue, 0.1),
                border: `1px solid ${alpha(colorValue, 0.3)}`,
                boxShadow: `0 4px 8px rgba(0,0,0,0.05)`,
              }
            : {},
        }}>
        {/* 图标容器 */}
        <Grid
          component="div"
          className="interface-metric-icon"
          sx={{
            mr: 1,
            ml: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "50%",
            bgcolor: alpha(colorValue, 0.1),
            color: colorValue,
          }}>
          {icon}
        </Grid>

        {/* 文本内容 */}
        <Grid component="div" sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block", lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Grid
            component="div"
            sx={{ display: "flex", alignItems: "baseline" }}>
            <Typography
              variant="body1"
              noWrap
              sx={{ mr: 0.5, fontWeight: 550, lineHeight: 1.25 }}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {unit}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    );
  },
);

CompactStatCard.displayName = "CompactStatCard";
