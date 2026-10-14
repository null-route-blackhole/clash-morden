import { useCallback, useSyncExternalStore } from "react";

import delayManager from "@/services/delay";

/**
 * 订阅某个分组延迟测试结果的变化，返回版本号。
 * 卡内以版本号为 useMemo 依赖，重新读取 delayManager.getDelayFix，
 * 避免直接以 DelaySnapshot 订阅带来的快照身份缓存问题。
 */
export const useGroupDelayVersion = (group: string | null) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!group) return () => {};
      delayManager.setGroupListener(group, onChange);
      return () => delayManager.removeGroupListener(group, onChange);
    },
    [group],
  );

  const getSnapshot = useCallback(
    () => (group ? delayManager.getGroupVersion(group) : 0),
    [group],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
