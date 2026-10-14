import LanRoundedIcon from "@mui/icons-material/LanRounded";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useConnectionData } from "@/hooks/use-connection-data";
import parseTraffic from "@/utils/parse-traffic";

import { TopListCard, type TopListEntry } from "./top-list-card";

const TOP_N = 10;

// 目标 IP 统计：活跃连接按 destinationIP 聚合（默认隐藏）
export const DestinationIpStatsCard = () => {
  const { t } = useTranslation();
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();

  const entries = useMemo<TopListEntry[]>(() => {
    const byIp = new Map<string, { count: number; traffic: number; host: string }>();

    for (const conn of connectionData.activeConnections) {
      const ip = conn.metadata.destinationIP;
      if (!ip) continue;
      const entry = byIp.get(ip) ?? { count: 0, traffic: 0, host: "" };
      entry.count += 1;
      entry.traffic += conn.download + conn.upload;
      if (!entry.host && conn.metadata.host) entry.host = conn.metadata.host;
      byIp.set(ip, entry);
    }

    const sorted = [...byIp.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, TOP_N);
    const max = sorted[0]?.[1].count ?? 1;

    return sorted.map(([ip, { count, traffic, host }]) => {
      const [value, unit] = parseTraffic(traffic);
      return {
        label: ip,
        sublabel: host || `${value}${unit}`,
        value: String(count),
        ratio: count / max,
      };
    });
  }, [connectionData]);

  return (
    <TopListCard
      title={t("pages.home.components.destIpStats.title")}
      icon={<LanRoundedIcon />}
      iconColor="secondary"
      entries={entries}
      emptyText={t("pages.home.components.destIpStats.empty")}
    />
  );
};
