import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useConnectionData } from "@/hooks/use-connection-data";
import { useRulesStats } from "@/hooks/use-rules-stats";
import { lookupCountryCodes } from "@/services/geoip";
import { useConnectionHistoryStore } from "@/stores/connectionHistoryStore";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";
import { connectionDestinationIP } from "@/utils/connection-destination";
import { resolveIntlLocale } from "@/utils/intl-locale";
import parseTraffic from "@/utils/parse-traffic";

import { antColor } from "./ant-colors";
import {
  mergeCountryTraffic,
  resolveExitRegion,
} from "./connection-statistics-utils";

type Entry = { label: string; value: number; unit?: string };
type Panel = {
  title: string;
  icon: React.ReactNode;
  color: string;
  entries: Entry[];
};
const TOP_N = 5;
const REFRESH_INTERVAL = 15 * 60 * 1000;
const traffic = (value: number) => {
  const [amount, unit] = parseTraffic(value);
  return `${amount} ${unit}`;
};

const top = (map: Map<string, number>) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([label, value]) => ({ label, value }));

const AggregatePanel = memo(({ panel }: { panel: Panel }) => {
  const { t } = useTranslation();
  const max = Math.max(...panel.entries.map((entry) => entry.value), 1);
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        borderRadius: 2,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        minWidth: 0,
        "&:hover": { borderColor: "text.secondary" },
      }}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", mb: 1.25 }}>
        <Box sx={{ color: panel.color, display: "flex" }}>{panel.icon}</Box>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 600 }}>
          {panel.title}
        </Typography>
      </Stack>
      <Stack spacing={0.75}>
        {panel.entries.length ? (
          panel.entries.map((entry, index) => (
            <Box key={`${entry.label}-${index}`} sx={{ minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "baseline" }}>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ width: 12, flexShrink: 0 }}>
                  {index + 1}
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ flex: 1, minWidth: 0 }}
                  title={entry.label}>
                  {entry.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {entry.unit === "hits"
                    ? `${Math.round(entry.value)} ${t("pages.home.components.aggregateStats.hits")}`
                    : entry.unit
                      ? `${entry.value.toFixed(2)} ${entry.unit}`
                      : traffic(entry.value)}
                </Typography>
              </Stack>
              <Box
                sx={{
                  height: 3,
                  mt: 0.5,
                  bgcolor: "divider",
                  borderRadius: 99,
                }}>
                <Box
                  sx={{
                    height: "100%",
                    width: `${Math.max(3, (entry.value / max) * 100)}%`,
                    bgcolor: panel.color,
                    borderRadius: 99,
                  }}
                />
              </Box>
            </Box>
          ))
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        )}
      </Stack>
    </Paper>
  );
});
AggregatePanel.displayName = "AggregatePanel";

export const AggregateConnectionStatsCard = () => {
  const { t, i18n } = useTranslation();
  const locale = resolveIntlLocale(i18n.language);
  const colorIntensity = useInterfaceStyleStore(
    (state) => state.colorIntensity,
  );
  const colorOpacity = useInterfaceStyleStore((state) => state.colorOpacity);
  const dark = document.documentElement.classList.contains("dark");
  const rules = useRulesStats();
  const history = useConnectionHistoryStore((state) => state.buckets);
  const [countryCodes, setCountryCodes] = useState<Record<string, string>>({});
  const pendingCountries = useRef(new Set<string>());
  const {
    response: { data = { activeConnections: [] } },
  } = useConnectionData();
  const [refreshToken, setRefreshToken] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setRefreshToken((value) => value + 1),
      REFRESH_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, []);
  const countryNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  useEffect(() => {
    const ips = new Set<string>();
    for (const bucket of Object.values(history)) {
      for (const row of Object.values(
        (bucket as { countries?: Record<string, { label: string }> })
          .countries ?? {},
      )) {
        if (row.label.includes(".") || row.label.includes(":"))
          ips.add(row.label);
      }
    }
    for (const connection of data.activeConnections) {
      const ip = connection.metadata.destinationIP;
      if (ip && (ip.includes(".") || ip.includes(":"))) ips.add(ip);
    }
    const pending = [...ips].filter(
      (ip) => !countryCodes[ip] && !pendingCountries.current.has(ip),
    );
    if (!pending.length) return;
    pending.forEach((ip) => {
      pendingCountries.current.add(ip);
    });
    void lookupCountryCodes(pending)
      .then((result) =>
        setCountryCodes((current) => ({ ...current, ...result })),
      )
      .catch(() => {})
      .finally(() => {
        pending.forEach((ip) => {
          pendingCountries.current.delete(ip);
        });
      });
  }, [refreshToken]);

  const panels = useMemo<Panel[]>(() => {
    const sums = (dimension: string) => {
      const result = new Map<string, number>();
      for (const bucket of Object.values(history)) {
        for (const row of Object.values(
          (
            bucket as Record<
              string,
              Record<
                string,
                { label: string; upload: number; download: number }
              >
            >
          )[dimension] ?? {},
        )) {
          result.set(
            row.label,
            (result.get(row.label) ?? 0) + row.upload + row.download,
          );
        }
      }
      return result;
    };
    const activeSums = (
      getter: (connection: (typeof data.activeConnections)[number]) => string,
    ) => {
      const result = new Map<string, number>();
      for (const connection of data.activeConnections) {
        const label = getter(connection) || "Unknown";
        result.set(
          label,
          (result.get(label) ?? 0) + connection.upload + connection.download,
        );
      }
      return result;
    };
    const merge = (
      historyMap: Map<string, number>,
      activeMap: Map<string, number>,
    ) => {
      if (historyMap.size) return historyMap;
      return activeMap;
    };
    const ruleHits = new Map<string, number>();
    for (const rule of rules) {
      const hitCount = rule.extra?.hitCount ?? 0;
      if (!hitCount) continue;
      const label = `${rule.type}(${rule.payload})`;
      ruleHits.set(label, (ruleHits.get(label) ?? 0) + hitCount);
    }
    const ruleEntries = top(ruleHits).map((entry) => ({
      ...entry,
      unit: "hits",
    }));
    const target = merge(
      sums("countries"),
      activeSums((c) => connectionDestinationIP(c.metadata) || "Unknown"),
    );
    const targetByCountry = mergeCountryTraffic(
      target,
      countryCodes,
      countryNames,
    );
    const targetEntries = top(targetByCountry);
    const exit = merge(
      (() => {
        const result = new Map<string, number>();
        for (const bucket of Object.values(history)) {
          for (const row of Object.values(
            (
              bucket as Record<
                string,
                Record<
                  string,
                  { label: string; upload: number; download: number }
                >
              >
            ).nodes ?? {},
          )) {
            const label = resolveExitRegion(row.label);
            result.set(
              label,
              (result.get(label) ?? 0) + row.upload + row.download,
            );
          }
        }
        return result;
      })(),
      activeSums((c) => resolveExitRegion(c.chains?.[0] || "DIRECT")),
    );
    return [
      {
        title: t("pages.home.components.aggregateStats.rules"),
        icon: <GavelRoundedIcon fontSize="small" />,
        color: antColor("gold", dark, colorIntensity, colorOpacity),
        entries: ruleEntries,
      },
      {
        title: t("pages.home.components.aggregateStats.hosts"),
        icon: <LanguageRoundedIcon fontSize="small" />,
        color: antColor("cyan", dark, colorIntensity, colorOpacity),
        entries: top(
          merge(
            sums("hosts"),
            activeSums(
              (c) =>
                c.metadata.host ||
                c.metadata.sniffHost ||
                c.metadata.destinationIP ||
                "Unknown",
            ),
          ),
        ),
      },
      {
        title: t("pages.home.components.aggregateStats.nodes"),
        icon: <LayersRoundedIcon fontSize="small" />,
        color: antColor("blue", dark, colorIntensity, colorOpacity),
        entries: top(exit),
      },
      {
        title: t("pages.home.components.aggregateStats.targetCountries"),
        icon: <FlagRoundedIcon fontSize="small" />,
        color: antColor("purple", dark, colorIntensity, colorOpacity),
        entries: targetEntries,
      },
      {
        title: t("pages.home.components.aggregateStats.exitCountries"),
        icon: <HubRoundedIcon fontSize="small" />,
        color: antColor("green", dark, colorIntensity, colorOpacity),
        entries: top(exit),
      },
      {
        title: t("pages.home.components.aggregateStats.processes"),
        icon: <AppsRoundedIcon fontSize="small" />,
        color: antColor("magenta", dark, colorIntensity, colorOpacity),
        entries: top(
          merge(
            sums("process"),
            activeSums(
              (c) => c.metadata.process || c.metadata.processPath || "Unknown",
            ),
          ),
        ),
      },
    ];
  }, [
    colorIntensity,
    colorOpacity,
    dark,
    refreshToken,
    countryCodes,
    countryNames,

    locale,
    rules,
    t,
  ]);

  return (
    <Box
      sx={{
        containerType: "inline-size",
      }}>
      <Box
        onClick={() => setRefreshToken((value) => value + 1)}
        sx={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1.5,
          "@container (min-width: 700px)": {
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          },
        }}>
        {panels.map((panel) => (
          <AggregatePanel key={panel.title} panel={panel} />
        ))}
      </Box>
    </Box>
  );
};
