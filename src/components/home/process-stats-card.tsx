import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useConnectionData } from "@/hooks/use-connection-data";
import parseTraffic from "@/utils/parse-traffic";

import { TopListCard, type TopListEntry } from "./top-list-card";

const TOP_N = 10;

const basename = (path: string) => path.split(/[\\/]/).pop() || path;

// 进程统计：活跃连接按 metadata.process 聚合（默认隐藏）
export const ProcessStatsCard = () => {
  const { t } = useTranslation();
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();

  const entries = useMemo<TopListEntry[]>(() => {
    const byProcess = new Map<string, { count: number; traffic: number }>();

    for (const conn of connectionData.activeConnections) {
      const process = conn.metadata.process || "unknown";
      const entry = byProcess.get(process) ?? { count: 0, traffic: 0 };
      entry.count += 1;
      entry.traffic += conn.download + conn.upload;
      byProcess.set(process, entry);
    }

    const sorted = [...byProcess.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, TOP_N);
    const max = sorted[0]?.[1].count ?? 1;

    return sorted.map(([process, { count, traffic }]) => {
      const [value, unit] = parseTraffic(traffic);
      return {
        label: basename(process),
        sublabel: `${value}${unit}`,
        value: String(count),
        ratio: count / max,
      };
    });
  }, [connectionData]);

  return (
    <TopListCard
      title={t("pages.home.components.processStats.title")}
      icon={<AppsRoundedIcon />}
      iconColor="primary"
      entries={entries}
      emptyText={t("pages.home.components.processStats.empty")}
    />
  );
};
