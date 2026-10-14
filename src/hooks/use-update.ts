import { useState } from "react";

import { checkUpdateNow, useCheckUpdateSWR } from "@/services/swr";

const LAST_CHECK_KEY = "last_check_update";

export const readLastCheckTime = (): number | null => {
  const stored = localStorage.getItem(LAST_CHECK_KEY);
  if (!stored) return null;
  const ts = parseInt(stored, 10);
  return Number.isNaN(ts) ? null : ts;
};

export const updateLastCheckTime = (timestamp?: number): number => {
  const now = timestamp ?? Date.now();
  localStorage.setItem(LAST_CHECK_KEY, now.toString());
  return now;
};

/**
 * 首页「系统信息」卡使用的更新检查：复用全局 checkUpdate SWR（与设置页共享缓存），
 * 手动检查走 checkUpdateNow，本地记录上次检查时间。
 */
export const useUpdate = (enabled: boolean = true) => {
  const { data: updateInfo, isValidating: loading } =
    useCheckUpdateSWR(enabled);
  const [lastCheckUpdate, setLastCheckUpdate] = useState(readLastCheckTime);

  const checkUpdate = async () => {
    const data = await checkUpdateNow();
    setLastCheckUpdate(updateLastCheckTime());
    return { data };
  };

  return { updateInfo, checkUpdate, loading, lastCheckUpdate };
};
