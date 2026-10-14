import { useEffect } from "react";

import { useVisibility } from "@/hooks/use-visibility";
import { useRulesStateStore } from "@/stores";

/**
 * 规则数据共享 hook（规则命中卡/域名命中卡共用同一份 store + 轮询）
 * 挂载时空则拉取，可见时每 60s 刷新。
 */
export const useRulesStats = () => {
  const rules = useRulesStateStore((s) => s.rules);
  const fetchRules = useRulesStateStore((s) => s.fetchRules);
  const pageVisible = useVisibility();

  useEffect(() => {
    if (rules.length === 0) {
      void fetchRules();
    }
     
  }, []);

  useEffect(() => {
    if (!pageVisible) return;
    const timer = setInterval(() => void fetchRules(), 60_000);
    return () => clearInterval(timer);
  }, [pageVisible, fetchRules]);

  return rules;
};
