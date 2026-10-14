import { useCallback } from "react";
import {
  closeConnection,
  getConnections,
  type ProxyInfo,
  selectNodeForGroup,
  unfixedProxy,
} from "tauri-plugin-mihomo-api";

import { mutate, swrKeys } from "@/services/swr";
import { useProfilesStore, useVergeStore } from "@/stores";

export interface IProxyGroupLike {
  name: string;
  type: string;
  fixed?: string;
  now?: string;
}

// 清理经由旧节点建立的连接（auto_close_connection 开启时）
const cleanupConnections = async (previousProxy?: string) => {
  if (!previousProxy) return;
  try {
    const { connections } = await getConnections();
    const list = (connections ?? []).filter((conn) =>
      conn.chains.includes(previousProxy),
    );
    if (list.length > 0) {
      await Promise.allSettled(list.map((conn) => closeConnection(conn.id)));
    }
  } catch (err) {
    console.warn("[useProxySelection] 连接清理失败:", err);
  }
};

/**
 * 首页「当前代理」卡使用的节点切换逻辑，与代理页 proxy-groups.tsx 行为一致：
 * URLTest 选中固定节点时执行取消固定，其余走 selectNodeForGroup；
 * 切换后刷新代理数据，并把选择持久化到当前配置的 selected 中。
 */
export const useProxySelection = () => {
  const autoCloseConnection = useVergeStore(
    (s) => s.verge.auto_close_connection ?? true,
  );
  const currentProfile = useProfilesStore((s) => s.currentProfile);
  const patchCurrentProfile = useProfilesStore((s) => s.patchCurrentProfile);

  const select = useCallback(
    async (group: IProxyGroupLike, proxy: ProxyInfo) => {
      if (!["Selector", "URLTest", "Fallback"].includes(group.type)) return;

      const { name, type, fixed, now } = group;
      let unfixing = false;

      if (type === "URLTest") {
        if (fixed === proxy.name) {
          unfixing = true;
          await unfixedProxy(group.name);
        } else {
          await selectNodeForGroup(name, proxy.name);
        }
      } else {
        await selectNodeForGroup(name, proxy.name);
      }
      void mutate(swrKeys.proxies);

      // 断开经由旧节点的连接
      if (autoCloseConnection) {
        void cleanupConnections(now);
      }

      // 保存到 selected 中
      if (!currentProfile) return;
      const selected = [...(currentProfile.selected ?? [])];
      const nextProxyName = unfixing ? undefined : proxy.name;
      const selectedIndex = selected.findIndex(
        (item) => item.name === group.name,
      );

      if (selectedIndex < 0) {
        selected.push({ name, now: nextProxyName });
      } else {
        selected[selectedIndex] = { name, now: nextProxyName };
      }

      await patchCurrentProfile({ selected });
    },
    [autoCloseConnection, currentProfile, patchCurrentProfile],
  );

  return { select };
};
