import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import {
  Box,
  ButtonGroup,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  useTheme,
} from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BaseDialog } from "@/components/base";
import {
  TopListBars,
  type TopListEntry,
} from "@/components/home/top-list-card";
import { useConnectionData } from "@/hooks/use-connection-data";
import { useRulesStats } from "@/hooks/use-rules-stats";
import { lookupCountryCodes } from "@/services/geoip";
import { useConnectionHistoryStore } from "@/stores/connectionHistoryStore";
import { connectionDestinationIP } from "@/utils/connection-destination";
import { resolveIntlLocale } from "@/utils/intl-locale";
import parseTraffic from "@/utils/parse-traffic";

import {
  resolveCountryLabel,
  resolveExitRegion,
} from "./connection-statistics-utils";
import { EnhancedCard } from "./enhanced-card";

const TOP_N = 10;

type Dimension =
  | "nodes"
  | "clients"
  | "destIp"
  | "process"
  | "rules"
  | "countries"
  | "exitCountries"
  | "hosts"
  | "groups";
type SortMetric = "count" | "traffic" | "upload" | "download" | "label";

interface Row {
  label: string;
  count: number;
  traffic: number | null; // Rule hit counters do not include traffic.
  download: number | null;
  upload: number | null;
}

// 连接统计卡（参考 zashboard ConnectionHistory）：上方全局统计块 +
// 维度切换（节点/客户端/目标IP/进程/规则命中/域名命中）+ Top-N 排名表
export const ConnectionStatsCard = () => {
  const { t, i18n } = useTranslation();
  const intlLocale = resolveIntlLocale(i18n.language);
  const theme = useTheme();
  const [savedView] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("connection-statistics-view") ?? "{}",
      );
      return {
        dimension: ([
          "nodes",
          "clients",
          "destIp",
          "process",
          "rules",
          "countries",
          "hosts",
          "groups",
        ].includes(saved.dimension)
          ? saved.dimension
          : "nodes") as Dimension,
        viewMode: (saved.viewMode === "chart" ? "chart" : "table") as
          "chart" | "table",
        sortMetric: ([
          "count",
          "traffic",
          "upload",
          "download",
          "label",
        ].includes(saved.sortMetric)
          ? saved.sortMetric
          : "download") as SortMetric,
        descending: saved.descending !== false,
      };
    } catch {
      return {
        dimension: "nodes" as Dimension,
        viewMode: "table" as const,
        sortMetric: "download" as SortMetric,
        descending: true,
      };
    }
  });
  const [dimension, setDimension] = useState(savedView.dimension);
  const [viewMode, setViewMode] = useState<"table" | "chart">(
    savedView.viewMode,
  );
  const [sortMetric, setSortMetric] = useState(savedView.sortMetric);
  const [descending, setDescending] = useState(savedView.descending);
  useEffect(() => {
    try {
      localStorage.setItem(
        "connection-statistics-view",
        JSON.stringify({ dimension, viewMode, sortMetric, descending }),
      );
    } catch {
      /* The active view still works if storage is full. */
    }
  }, [dimension, viewMode, sortMetric, descending]);
  const [confirmClear, setConfirmClear] = useState(false);
  const historyBuckets = useConnectionHistoryStore((state) => state.buckets);
  const retentionDays = useConnectionHistoryStore(
    (state) => state.retentionDays,
  );
  const setRetentionDays = useConnectionHistoryStore(
    (state) => state.setRetentionDays,
  );
  const clearHistory = useConnectionHistoryStore((state) => state.clear);
  const startedAt = useConnectionHistoryStore((state) => state.startedAt);
  const tableRef = useRef<HTMLDivElement>(null);
  const pendingCountryLookups = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const countryCodesRef = useRef<Record<string, string>>({});
  const [countryCodes, setCountryCodes] = useState<Record<string, string>>({});
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([intlLocale], { type: "region" });
    } catch {
      return null;
    }
  }, [intlLocale]);

  // 每个维度的图形视图使用不同颜色（与独立统计卡主题色一致）
  const DIMENSION_COLORS: Record<
    Dimension,
    "primary" | "secondary" | "success" | "warning" | "error" | "info"
  > = {
    nodes: "success",
    hosts: "secondary",
    groups: "primary",
    clients: "error",
    destIp: "secondary",
    process: "info",
    rules: "warning",
    countries: "info",
    exitCountries: "success",
  };

  const {
    response: {
      data: connectionData = { activeConnections: [], closedConnections: [] },
    },
  } = useConnectionData();
  const rules = useRulesStats();

  useEffect(() => {
    const ips = [
      ...new Set([
        ...connectionData.activeConnections.map((connection) =>
          connectionDestinationIP(connection.metadata),
        ),
        ...Object.values(historyBuckets).flatMap((bucket) =>
          Object.values(bucket.countries ?? {}).map((row) => row.label),
        ),
      ]),
    ]
      .filter(
        (ip) =>
          ip &&
          (ip.includes(".") || ip.includes(":")) &&
          !countryCodesRef.current[ip] &&
          !pendingCountryLookups.current.has(ip),
      )
      .slice(0, 200);
    if (!ips.length) return;
    ips.forEach((ip) => {
      pendingCountryLookups.current.add(ip);
    });
    void lookupCountryCodes(ips)
      .then((result) => {
        Object.assign(countryCodesRef.current, result);
        if (mounted.current)
          setCountryCodes((current) => ({ ...current, ...result }));
      })
      .catch(() => {})
      .finally(() =>
        ips.forEach((ip) => {
          pendingCountryLookups.current.delete(ip);
        }),
      );
  }, [connectionData, historyBuckets]);

  const dimensions: { value: Dimension; label: string }[] = [
    {
      value: "hosts",
      label: t("pages.home.components.connectionStats.dimensions.hosts"),
    },
    {
      value: "groups",
      label: t("pages.home.components.connectionStats.dimensions.groups"),
    },
    {
      value: "nodes",
      label: t("pages.home.components.connectionStats.dimensions.nodes"),
    },
    {
      value: "clients",
      label: t("pages.home.components.connectionStats.dimensions.clients"),
    },
    {
      value: "destIp",
      label: t("pages.home.components.connectionStats.dimensions.destIp"),
    },
    {
      value: "process",
      label: t("pages.home.components.connectionStats.dimensions.process"),
    },
    {
      value: "rules",
      label: t("pages.home.components.connectionStats.dimensions.rules"),
    },
    {
      value: "countries",
      label: t("pages.home.components.connectionStats.dimensions.countries"),
    },
    {
      value: "exitCountries",
      label: t(
        "pages.home.components.connectionStats.dimensions.exitCountries",
      ),
    },
  ];

  // 连接维度聚合
  const rows = useMemo<Row[]>(() => {
    if (dimension === "rules") {
      const result = new Map<string, Row>();
      for (const rule of rules) {
        const count = rule.extra?.hitCount ?? 0;
        if (!count) continue;
        const label = `${rule.type}(${rule.payload})`;
        result.set(label, {
          label,
          count: (result.get(label)?.count ?? 0) + count,
          traffic: null,
          upload: null,
          download: null,
        });
      }
      return [...result.values()];
    }
    const byKey = new Map<string, Row>();
    for (const bucket of Object.values(historyBuckets)) {
      const sourceDimension =
        dimension === "exitCountries" ? "nodes" : dimension;
      for (const row of Object.values(bucket[sourceDimension] ?? {})) {
        let label = row.label;
        if (dimension === "exitCountries") label = resolveExitRegion(label);
        if (dimension === "destIp" && label === "Unknown")
          label = t("pages.home.components.connectionStats.ipUnavailable");
        if (dimension === "countries") {
          label = resolveCountryLabel(label, countryCodes, regionNames);
        }
        const previous = byKey.get(label);
        byKey.set(label, {
          label,
          count: (previous?.count ?? 0) + row.count,
          upload: (previous?.upload ?? 0) + row.upload,
          download: (previous?.download ?? 0) + row.download,
          traffic: (previous?.traffic ?? 0) + row.upload + row.download,
        });
      }
    }
    return [...byKey.values()];
  }, [
    historyBuckets,
    countryCodes,
    dimension,
    regionNames,
    rules,
    sortMetric,
    t,
  ]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const delta =
          sortMetric === "label"
            ? a.label.localeCompare(b.label)
            : (a[sortMetric] ?? 0) - (b[sortMetric] ?? 0);
        return descending ? -delta : delta;
      }),
    [rows, sortMetric, descending],
  );
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const topSpace = virtualRows[0]?.start ?? 0;
  const bottomSpace = Math.max(
    0,
    virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0),
  );
  const columns: { key: SortMetric; label: string }[] = [
    {
      key: "label",
      label: dimensions.find((item) => item.value === dimension)?.label ?? "",
    },
    {
      key: "download",
      label: t("pages.home.components.connectionStats.columns.download"),
    },
    {
      key: "upload",
      label: t("pages.home.components.connectionStats.columns.upload"),
    },
    {
      key: "traffic",
      label: t("pages.home.components.connectionStats.totalTraffic"),
    },
    {
      key: "count",
      label: t("pages.home.components.connectionStats.columns.count"),
    },
  ];

  // 图形视图：进度条列表（与其它统计卡同一视觉语言）
  const barEntries = useMemo<TopListEntry[]>(
    () =>
      sortedRows.slice(0, TOP_N).map((row) => {
        const [value, unit] =
          row.traffic == null ? ["", ""] : parseTraffic(row.traffic);
        return {
          label: row.label,
          sublabel: row.traffic == null ? undefined : `${value}${unit}`,
          value: String(row.count),
          ratio: row.count / maxCount,
        };
      }),
    [sortedRows, maxCount],
  );

  return (
    <EnhancedCard
      iconKind="chart"
      title={
        <Tooltip
          title={t("pages.home.components.connectionStats.scope", {
            since: new Date(startedAt).toLocaleString(intlLocale),
          })}>
          <span className="interface-card-title">
            {t("pages.home.components.connectionStats.title")}
          </span>
        </Tooltip>
      }
      icon={<InsightsRoundedIcon />}
      iconColor="primary"
      action={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}>
          <Select
            size="small"
            value={dimension}
            onChange={(event) => {
              setDimension(event.target.value as Dimension);
              tableRef.current?.scrollTo({ top: 0 });
            }}
            sx={{
              height: 28,
              minHeight: 28,
              fontSize: "0.75rem",
              "& .MuiSelect-select": { py: 0.5 },
            }}>
            {dimensions.map((item) => (
              <MenuItem key={item.value} value={item.value} dense>
                {item.label}
              </MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={sortMetric}
            onChange={(event) =>
              setSortMetric(event.target.value as SortMetric)
            }
            sx={{
              height: 28,
              minHeight: 28,
              fontSize: "0.75rem",
              "& .MuiSelect-select": { py: 0.5 },
            }}>
            <MenuItem value="download" dense>
              {t("pages.home.components.connectionStats.columns.download")}
            </MenuItem>
            <MenuItem value="upload" dense>
              {t("pages.home.components.connectionStats.columns.upload")}
            </MenuItem>
            <MenuItem value="label" dense>
              {t("pages.home.components.connectionStats.columns.name")}
            </MenuItem>
            <MenuItem value="count" dense>
              {t("pages.home.components.connectionStats.sort.count")}
            </MenuItem>
            <MenuItem value="traffic" dense>
              {t("pages.home.components.connectionStats.sort.traffic")}
            </MenuItem>
          </Select>
          <Select
            size="small"
            value={retentionDays}
            inputProps={{
              "aria-label": t(
                "pages.home.components.connectionStats.retention",
              ),
            }}
            onChange={(event) => setRetentionDays(Number(event.target.value))}>
            {[7, 30, 90, 0].map((days) => (
              <MenuItem key={days} value={days}>
                {days
                  ? t("pages.home.components.connectionStats.days", {
                      count: days,
                    })
                  : t("pages.home.components.connectionStats.forever")}
              </MenuItem>
            ))}
          </Select>
          <Tooltip title={t("pages.home.components.connectionStats.clear")}>
            <IconButton
              size="small"
              aria-label={t("pages.home.components.connectionStats.clear")}
              onClick={() => setConfirmClear(true)}>
              <Trash2 size={16} strokeWidth={1.65} />
            </IconButton>
          </Tooltip>
          {/* 表格 / 图形 视图切换 */}
          <ButtonGroup size="small">
            <Tooltip
              title={t("pages.home.components.connectionStats.view.table")}>
              <IconButton
                size="small"
                color={viewMode === "table" ? "primary" : "default"}
                onClick={() => setViewMode("table")}>
                <TableRowsRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={t("pages.home.components.connectionStats.view.chart")}>
              <IconButton
                size="small"
                color={viewMode === "chart" ? "primary" : "default"}
                onClick={() => setViewMode("chart")}>
                <BarChartRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </ButtonGroup>
        </Box>
      }>
      {/* 图形视图（进度条） */}
      {viewMode === "chart" && rows.length > 0 && (
        <TopListBars
          entries={barEntries}
          maxHeight={1000}
          barColor={theme.palette[DIMENSION_COLORS[dimension]].main}
          idPrefix="connection-stats"
        />
      )}

      {viewMode === "table" && (
        <TableContainer ref={tableRef} sx={{ height: 384 }}>
          <Table
            stickyHeader
            size="small"
            sx={{ minWidth: 420, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    align={column.key === "label" ? "left" : "right"}
                    sx={{ width: column.key === "label" ? "40%" : "15%" }}
                    sortDirection={
                      sortMetric === column.key
                        ? descending
                          ? "desc"
                          : "asc"
                        : false
                    }>
                    <TableSortLabel
                      active={sortMetric === column.key}
                      direction={descending ? "desc" : "asc"}
                      onClick={() => {
                        setDescending(
                          sortMetric === column.key
                            ? !descending
                            : column.key !== "label",
                        );
                        setSortMetric(column.key);
                        tableRef.current?.scrollTo({ top: 0 });
                      }}>
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {topSpace > 0 && (
                <TableRow aria-hidden>
                  <TableCell
                    colSpan={5}
                    sx={{ height: topSpace, p: 0, border: 0 }}
                  />
                </TableRow>
              )}
              {virtualRows.map((virtualRow) => {
                const row = sortedRows[virtualRow.index];
                return (
                  <TableRow key={row.label} hover sx={{ height: 36 }}>
                    {columns.map(({ key }) => (
                      <TableCell
                        key={key}
                        align={key === "label" ? "left" : "right"}
                        title={key === "label" ? row.label : undefined}
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                        {key === "label"
                          ? row.label
                          : key === "count"
                            ? row.count
                            : row[key] === null
                              ? "—"
                              : parseTraffic(row[key]).join(" ")}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {bottomSpace > 0 && (
                <TableRow aria-hidden>
                  <TableCell
                    colSpan={5}
                    sx={{ height: bottomSpace, p: 0, border: 0 }}
                  />
                </TableRow>
              )}

              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    {t("pages.home.components.connectionStats.noData")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <BaseDialog
        open={confirmClear}
        title={t("pages.home.components.connectionStats.clear")}
        onClose={() => setConfirmClear(false)}
        onCancel={() => setConfirmClear(false)}
        onOk={() => {
          clearHistory();
          setConfirmClear(false);
        }}>
        {t("pages.home.components.connectionStats.confirmClear")}
      </BaseDialog>
    </EnhancedCard>
  );
};
