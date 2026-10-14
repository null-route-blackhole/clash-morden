import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { IconButton, Tooltip } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useRulesStats } from "@/hooks/use-rules-stats";
import { useRulesStateStore } from "@/stores";

import { TopListCard, type TopListEntry } from "./top-list-card";

const TOP_N = 10;

// 规则命中统计：/rules 的 extra.hitCount Top 10（默认隐藏，可从「添加模块」打开）
export const RuleHitStatsCard = () => {
  const { t } = useTranslation();
  const rules = useRulesStats();
  const fetchRules = useRulesStateStore((s) => s.fetchRules);

  const entries = useMemo<TopListEntry[]>(() => {
    const withExtra = rules.filter((rule) => rule.extra?.hitCount);
    const sorted = [...withExtra]
      .sort((a, b) => (b.extra!.hitCount ?? 0) - (a.extra!.hitCount ?? 0))
      .slice(0, TOP_N);
    const max = sorted[0]?.extra?.hitCount ?? 1;

    return sorted.map((rule) => ({
      label: `${rule.type}(${rule.payload})`,
      value: String(rule.extra!.hitCount ?? 0),
      ratio: (rule.extra!.hitCount ?? 0) / max,
    }));
  }, [rules]);

  const hasAnyExtra = useMemo(() => rules.some((rule) => rule.extra), [rules]);

  return (
    <TopListCard
      title={t("pages.home.components.ruleStats.title")}
      icon={<GavelRoundedIcon />}
      iconColor="warning"
      entries={entries}
      emptyText={
        rules.length === 0
          ? t("pages.home.components.ruleStats.noHitData")
          : !hasAnyExtra
            ? t("pages.home.components.ruleStats.disabledHint")
            : t("pages.home.components.ruleStats.noHitData")
      }
      action={
        <Tooltip title={t("common.actions.refresh")}>
          <IconButton size="small" onClick={() => void fetchRules()}>
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    />
  );
};
