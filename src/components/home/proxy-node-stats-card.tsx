import HubRoundedIcon from "@mui/icons-material/HubRounded";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useConnectionData } from "@/hooks/use-connection-data";
import parseTraffic from "@/utils/parse-traffic";

import { TopListCard, type TopListEntry } from "./top-list-card";

const TOP_N = 10;

// 节点命中统计：活跃连接按出站节点（chains[0]）聚合（默认隐藏）
export const ProxyNodeStatsCard = () => {
  const { t } = useTranslation();
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();

  const entries = useMemo<TopListEntry[]>(() => {
    const byNode = new Map<string, { count: number; traffic: number }>();

    for (const conn of connectionData.activeConnections) {
      const node = conn.chains?.[0] || "DIRECT";
      const entry = byNode.get(node) ?? { count: 0, traffic: 0 };
      entry.count += 1;
      entry.traffic += conn.download + conn.upload;
      byNode.set(node, entry);
    }

    const sorted = [...byNode.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, TOP_N);
    const max = sorted[0]?.[1].count ?? 1;

    return sorted.map(([node, { count, traffic }]) => {
      const [value, unit] = parseTraffic(traffic);
      return {
        label: node,
        sublabel: `${value}${unit}`,
        value: String(count),
        ratio: count / max,
      };
    });
  }, [connectionData]);

  return (
    <TopListCard
      title={t("pages.home.components.nodeStats.title")}
      icon={<HubRoundedIcon />}
      iconColor="success"
      entries={entries}
      emptyText={t("pages.home.components.nodeStats.empty")}
    />
  );
};
