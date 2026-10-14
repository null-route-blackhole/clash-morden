import { alpha, Box, Typography, useTheme } from "@mui/material";
import { type ReactNode, useMemo } from "react";

import { EnhancedCard } from "./enhanced-card";

export interface TopListEntry {
  /** 主标签（域名/节点/IP/国名等） */
  label: string;
  /** 次标签（host、目标数、路径等，可选） */
  sublabel?: string;
  /** 格式化后的数值（如 "1.2 MB"、"23"） */
  value: string;
  /** 0..1 占比（进度条） */
  ratio: number;
}

interface TopListCardProps {
  title: string;
  icon: ReactNode;
  iconColor?:
    "primary" | "secondary" | "error" | "warning" | "info" | "success";
  entries: TopListEntry[];
  emptyText: string;
  action?: ReactNode;
  maxHeight?: number;
}

// 通用 Top-N 统计卡：双栏（窄屏单栏），每项 = 标签行 + 占比渐变条
export const TopListCard = ({
  title,
  icon,
  iconColor = "primary",
  entries,
  emptyText,
  action,
  maxHeight = 300,
}: TopListCardProps) => {
  const theme = useTheme();
  const barColor = theme.palette[iconColor].main;

  const content = useMemo(() => {
    if (entries.length === 0) {
      return (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {emptyText}
          </Typography>
        </Box>
      );
    }

    return (
      <TopListBars
        entries={entries}
        barColor={barColor}
        idPrefix={`top-list-${title}`}
      />
    );
  }, [entries, emptyText, barColor, title]);

  return (
    <EnhancedCard
      iconKind="chart"
      title={title}
      icon={icon}
      iconColor={iconColor}
      action={action}>
      <Box sx={{ maxHeight, overflowY: "auto", pr: 0.5 }}>{content}</Box>
    </EnhancedCard>
  );
};

/** 单栏进度条列表（统计卡共用：标签行 + 占比渐变条） */
export const TopListBars = ({
  entries,
  barColor,
  idPrefix,
  maxHeight = 300,
}: {
  entries: TopListEntry[];
  barColor: string;
  idPrefix: string;
  maxHeight?: number;
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        maxHeight,
        overflowY: "auto",
        pr: 0.5,
      }}>
      {entries.map((entry, idx) => {
        const gradientId = `${idPrefix}-${idx}`;
        return (
          <Box key={`${entry.label}-${idx}`}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                mb: 0.5,
                gap: 1,
              }}>
              <Typography
                variant="caption"
                noWrap
                title={
                  entry.sublabel
                    ? `${entry.label} (${entry.sublabel})`
                    : entry.label
                }
                sx={{ flex: 1, minWidth: 0 }}>
                {entry.label}
                {entry.sublabel && (
                  <Box
                    component="span"
                    sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
                    {" "}
                    {entry.sublabel}
                  </Box>
                )}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, flexShrink: 0 }}>
                {entry.value}
              </Typography>
            </Box>
            <svg width="100%" height="6" style={{ display: "block" }}>
              <title>{entry.label}</title>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={alpha(barColor, 0.45)} />
                  <stop offset="100%" stopColor={alpha(barColor, 0.75)} />
                </linearGradient>
              </defs>
              <rect
                width="100%"
                height="6"
                rx="3"
                fill={alpha(theme.palette.text.primary, 0.08)}
              />
              <rect
                width={`${Math.max(2, entry.ratio * 100)}%`}
                height="6"
                rx="3"
                fill={`url(#${gradientId})`}
              />
            </svg>
          </Box>
        );
      })}
    </Box>
  );
};
