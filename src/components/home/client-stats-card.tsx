import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useConnectionData } from "@/hooks/use-connection-data";
import parseTraffic from "@/utils/parse-traffic";

import { TopListCard, type TopListEntry } from "./top-list-card";

const TOP_N = 10;

// 客户端统计：活跃连接按 sourceIP 聚合（默认隐藏）
export const ClientStatsCard = () => {
  const { t } = useTranslation();
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();

  const entries = useMemo<TopListEntry[]>(() => {
    const byClient = new Map<
      string,
      { count: number; traffic: number; targets: Set<string> }
    >();

    for (const conn of connectionData.activeConnections) {
      const ip = conn.metadata.sourceIP || "Unknown";
      const entry = byClient.get(ip) ?? {
        count: 0,
        traffic: 0,
        targets: new Set<string>(),
      };
      entry.count += 1;
      entry.traffic += conn.download + conn.upload;
      if (conn.metadata.destinationIP) entry.targets.add(conn.metadata.destinationIP);
      byClient.set(ip, entry);
    }

    const sorted = [...byClient.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, TOP_N);
    const max = sorted[0]?.[1].count ?? 1;

    return sorted.map(([ip, { count, traffic, targets }]) => {
      const [value, unit] = parseTraffic(traffic);
      return {
        label: ip,
        sublabel: `${targets.size} ${t("pages.home.components.clientStats.targets")} · ${value}${unit}`,
        value: String(count),
        ratio: count / max,
      };
    });
  }, [connectionData, t]);

  return (
    <TopListCard
      title={t("pages.home.components.clientStats.title")}
      icon={<DevicesRoundedIcon />}
      iconColor="error"
      entries={entries}
      emptyText={t("pages.home.components.clientStats.empty")}
    />
  );
};
