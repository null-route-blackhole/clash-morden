import LanguageTwoToneIcon from "@mui/icons-material/LanguageTwoTone";
import NetworkCheckRoundedIcon from "@mui/icons-material/NetworkCheckRounded";
import {
  Box,
  ButtonGroup,
  IconButton,
  type Theme,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { convertFileSrc } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { ChartNoAxesColumn, ChartNoAxesGantt } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

// test icons
import apple from "@/assets/image/test/apple.svg?raw";
import github from "@/assets/image/test/github.svg?raw";
import google from "@/assets/image/test/google.svg?raw";
import youtube from "@/assets/image/test/youtube.svg?raw";
import { cmdTestDelay, downloadIconCache } from "@/services/cmds";
import delayManager from "@/services/delay";
import { useVergeStore } from "@/stores";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";

import { antColor } from "./ant-colors";
import { CardLegend } from "./card-legend";
import { EnhancedCard } from "./enhanced-card";

// 默认测试列表（与测试页一致）
const DEFAULT_TEST_LIST = [
  { uid: "apple", name: "Apple", url: "https://www.apple.com", icon: apple },
  {
    uid: "github",
    name: "GitHub",
    url: "https://www.github.com",
    icon: github,
  },
  {
    uid: "google",
    name: "Google",
    url: "https://www.google.com",
    icon: google,
  },
  {
    uid: "youtube",
    name: "Youtube",
    url: "https://www.youtube.com",
    icon: youtube,
  },
];

const encodeSvgDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const getFileName = (url: string) => url.substring(url.lastIndexOf("/") + 1);

// 单项图标（http 图标走本地缓存）
const TestIcon = ({ item }: { item: IVergeTestItem }) => {
  const [iconCachePath, setIconCachePath] = useState("");

  useEffect(() => {
    const icon = item.icon;
    if (icon?.trim().startsWith("http")) {
      void downloadIconCache(icon, `${item.uid}-${getFileName(icon)}`).then(
        (path) => setIconCachePath(convertFileSrc(path)),
      );
    }
  }, [item.icon, item.uid]);

  const icon = item.icon;
  if (icon?.trim().startsWith("data")) {
    return <img alt={item.name} src={icon} height="18px" />;
  }
  if (icon?.trim().startsWith("<svg")) {
    return <img alt={item.name} src={encodeSvgDataUri(icon)} height="18px" />;
  }
  if (icon?.trim().startsWith("http") && iconCachePath) {
    return <img alt={item.name} src={iconCachePath} height="18px" />;
  }
  return <LanguageTwoToneIcon sx={{ fontSize: 18 }} color="action" />;
};

// Use the active theme's semantic colors for both bars and current values.
const latencyColor = (
  delay: number,
  theme: Theme,
  intensity: number,
): string | null => {
  if (delay <= 0 || delay > 1e5) return null;
  return antColor(
    delay < 200 ? "green" : delay < 500 ? "gold" : "red",
    theme.palette.mode === "dark",
    intensity,
  );
};

const LatencyBar = ({ delay }: { delay: number }) => {
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const color = latencyColor(delay, theme, colorIntensity);

  if (!color) {
    return (
      <Box
        sx={{
          width: "100%",
          height: 6,
          borderRadius: 3,
          bgcolor: "rgba(127, 127, 127, 0.15)",
        }}
      />
    );
  }

  const percent = Math.min(100, (delay / 1000) * 100);

  return (
    <Box
      sx={{
        width: "100%",
        height: 6,
        borderRadius: 3,
        bgcolor: "rgba(127, 127, 127, 0.15)",
        overflow: "hidden",
      }}>
      <Box
        sx={{
          width: `${percent}%`,
          height: "100%",
          borderRadius: 3,
          bgcolor: color,
          transition: "width .3s ease",
        }}
      />
    </Box>
  );
};

const LATENCY_METRICS = [
  { key: "current", color: "text.secondary" },
  { key: "max", color: "max" },
  { key: "min", color: "min" },
  { key: "average", color: "average" },
] as const;

const metricColor = (key: string, theme: Theme, intensity: number) => {
  return antColor(
    key === "max" ? "purple" : key === "min" ? "blue" : "cyan",
    theme.palette.mode === "dark",
    intensity,
  );
};

const ROUNDS = 10;
type LatencyView = "history" | "legacy";

const LatencyHistory = ({ values }: { values: number[] }) => {
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const ceiling = Math.max(1, ...values.filter((value) => value > 0));
  return (
    <Box
      sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 26 }}>
      {Array.from({ length: ROUNDS }, (_, index) => {
        const value = values[index];
        const color =
          value === undefined
            ? "action.hover"
            : (latencyColor(value, theme, colorIntensity) ?? "error.main");
        return (
          <Box
            key={index}
            title={
              value === undefined
                ? undefined
                : value > 0
                  ? String(value)
                  : "Timeout"
            }
            sx={{
              flex: 1,
              borderRadius: "1px",
              bgcolor: color,
              opacity: value !== undefined && value <= 0 ? 0.4 : 1,
              height:
                value === undefined
                  ? "18%"
                  : value <= 0
                    ? "100%"
                    : `${Math.max(18, (value / ceiling) * 100)}%`,
              transition: "height .2s ease",
            }}
          />
        );
      })}
    </Box>
  );
};

// 单项行：图标 + 名字 + 延迟进度条 + 具体延迟；点击重测单项
const TestCardRow = ({
  item,
  view,
}: {
  item: IVergeTestItem;
  view: LatencyView;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const [delay, setDelay] = useState(-1);
  const [recent, setRecent] = useState<number[]>([]);
  const samples = recent.filter((value) => value > 0);

  const [history, setHistory] = useState<number[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const running = useRef(false);
  const generation = useRef(0);

  const onDelay = useCallback(async (url: string) => {
    if (running.current) return;
    running.current = true;
    const run = ++generation.current;
    const rounds = viewRef.current === "history" ? ROUNDS : 1;
    setDelay(-2);
    if (rounds > 1) {
      setHistory([]);
    }
    try {
      for (let index = 0; index < rounds; index++) {
        let result = -1;
        try {
          result = await cmdTestDelay(url);
        } catch {
          /* Record a failed round. */
        }
        if (run !== generation.current) return;
        if (result <= 0 || result > 1e5) result = -1;
        setDelay(result);
        setHistory((previous) => [...previous, result].slice(-ROUNDS));
        setRecent((previous) => [...previous, result].slice(-100));
      }
    } finally {
      if (run === generation.current) running.current = false;
    }
  }, []);

  useEffect(() => {
    setRecent([]);
    setHistory([]);
    void onDelay(item.url);
    let disposed = false;
    const unlisten = listen("verge://test-all", () => {
      if (!disposed) void onDelay(item.url);
    });
    return () => {
      disposed = true;
      generation.current++;
      running.current = false;
      unlisten.then((fn) => fn());
    };
  }, [item.url, onDelay]);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={item.name}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void onDelay(item.url);
        }
      }}
      onClick={() => void onDelay(item.url)}
      sx={{
        display: view === "history" ? "grid" : "flex",
        gridTemplateColumns: "minmax(0, 1fr)",
        alignItems: "center",
        gap: 0.5,
        px: view === "history" ? 0.5 : 1,
        py: 0.5,
        borderRadius: 1,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}>
      {view === "legacy" && (
        <Box
          sx={{
            width: 24,
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}>
          <TestIcon item={item} />
        </Box>
      )}
      <Typography
        variant="body2"
        noWrap
        title={item.name}
        sx={{ width: view === "history" ? "100%" : 72, flexShrink: 0 }}>
        {item.name}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {view === "history" ? (
          <LatencyHistory values={history} />
        ) : (
          <LatencyBar delay={delay} />
        )}
      </Box>
      <Box
        sx={{
          display: "grid",
          gridColumn: view === "history" ? "1" : undefined,
          justifyContent: view === "history" ? "stretch" : undefined,
          gridTemplateColumns:
            view === "history"
              ? "repeat(4, minmax(0, 1fr))"
              : "repeat(4, minmax(32px, max-content))",
          gap: 1,
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}>
        {LATENCY_METRICS.map(({ key, color }) => {
          const value =
            key === "current"
              ? delay === -2
                ? "…"
                : delayManager.formatDelay(delay).replace(/\s*ms$/i, "")
              : samples.length === 0
                ? "—"
                : `${key === "max" ? Math.max(...samples) : key === "min" ? Math.min(...samples) : Math.round(samples.reduce((sum, sample) => sum + sample, 0) / samples.length)}`;
          const label = t(`pages.home.components.tests.${key}`);
          return (
            <Tooltip key={key} title={label}>
              <Typography
                variant="caption"
                aria-label={`${label}: ${value}`}
                sx={{
                  textAlign: view === "history" ? "center" : "right",
                  whiteSpace: "nowrap",
                  color:
                    key === "current"
                      ? (latencyColor(delay, theme, colorIntensity) ??
                        "text.secondary")
                      : metricColor(color, theme, colorIntensity),
                }}>
                {value}
              </Typography>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

// 网站测试卡：只做延迟展示 + 全部测试（添加/编辑在测试页专门处理）
export const TestCard = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const [view, setView] = useState<LatencyView>(() =>
    localStorage.getItem("latency-view") === "legacy" ? "legacy" : "history",
  );
  const testList = useVergeStore(
    useShallow((s) => s.verge.test_list ?? DEFAULT_TEST_LIST),
  );

  const handleTestAll = useCallback(() => {
    emit("verge://test-all");
  }, []);

  return (
    <EnhancedCard
      iconKind="activity"
      title={t("pages.home.components.tests.title")}
      icon={<NetworkCheckRoundedIcon />}
      iconColor="primary"
      iconAction={{
        label: t("pages.test.actions.testAll"),
        onClick: handleTestAll,
      }}
      action={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CardLegend
            items={LATENCY_METRICS.filter(({ key }) => key !== "current").map(
              ({ key, color }) => ({
                key,
                color: metricColor(color, theme, colorIntensity),
                label: key === "max" ? "Max" : key === "min" ? "Min" : "Avg",
              }),
            )}
          />
          <ButtonGroup size="small">
            {(["history", "legacy"] as const).map((mode) => (
              <IconButton
                key={mode}
                size="small"
                aria-label={t(`pages.home.components.tests.${mode}`)}
                aria-pressed={view === mode}
                color={view === mode ? "primary" : "default"}
                onClick={() => {
                  setView(mode);
                  localStorage.setItem("latency-view", mode);
                }}>
                {mode === "history" ? (
                  <ChartNoAxesColumn size={16} strokeWidth={1.65} />
                ) : (
                  <ChartNoAxesGantt size={16} strokeWidth={1.65} />
                )}
              </IconButton>
            ))}
          </ButtonGroup>
        </Box>
      }>
      {/* 目标过多时限高内部滚动，避免把卡片撑高 */}
      <Box
        sx={{
          display: view === "history" ? "grid" : "flex",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 136px), 1fr))",
          flexDirection: "column",
          columnGap: 1.25,
          rowGap: view === "history" ? 0.75 : 0.25,
          maxHeight: 240,
          overflowY: "auto",
          pr: 0.5,
        }}>
        {testList.map((item) => (
          <TestCardRow key={item.uid} item={item} view={view} />
        ))}
      </Box>
    </EnhancedCard>
  );
};
