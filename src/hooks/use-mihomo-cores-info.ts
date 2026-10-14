import { useCallback } from "react";

import {
  checkPermissionsGranted,
  getMihomoCoreVersions,
  refreshPermissionsGranted,
} from "@/services/cmds";
import { swrKeys, useSWR } from "@/services/swr";
import { OS } from "@/utils/get-system";

import { usePortable } from "./use-portable";
import { useService } from "./use-service";

type MihomoCoreInfo = {
  name: string;
  core: "self-mihomo" | "self-mihomo-alpha" | "self-mihomo-smart";
  version: string;
  permissionsGranted: boolean;
};

const defaultValue: MihomoCoreInfo[] = [
  {
    name: "Mihomo",
    core: "self-mihomo",
    version: "",
    permissionsGranted: false,
  },
  {
    name: "Mihomo Alpha",
    core: "self-mihomo-alpha",
    version: "",
    permissionsGranted: false,
  },
  {
    name: "Mihomo Smart",
    core: "self-mihomo-smart",
    version: "",
    permissionsGranted: false,
  },
];

const MIHOMO_CORES = ["self-mihomo", "self-mihomo-alpha", "self-mihomo-smart"];

export const useMihomoCoresInfo = () => {
  const { serviceStatus } = useService();
  const serviceUnavailable =
    serviceStatus === "uninstall" || serviceStatus === "unknown";

  const { portable } = usePortable();
  const isLinuxPortable = portable && OS === "linux";

  const enableGrantPermissions = isLinuxPortable && serviceUnavailable;

  const {
    data: mihomoCoresInfo,
    mutate: muteMihomoCoresInfo,
    isLoading,
  } = useSWR(
    swrKeys.mihomoCoresInfo,
    async () => {
      let res = defaultValue;
      res = await refreshMihomoVersion(res);
      res = await refreshMihomoPermissions(res);
      return res;
    },
    { fallbackData: defaultValue },
  );

  const refreshMihomoVersion = useCallback(
    async (coresInfo: MihomoCoreInfo[]) => {
      const installed = await getMihomoCoreVersions().catch(() => []);
      const versions = installed.map(({ core, output }) => {
        const regex =
          /(alpha-smart-[\w.-]+|alpha-[\w.-]+|v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?)/i;
        const version = output.match(regex)?.[0] ?? "installed";
        return version ? { core, version } : null;
      });

      return versions.reduce((nextCoresInfo, result) => {
        if (!result) return nextCoresInfo;

        return nextCoresInfo.map((coreInfo) =>
          coreInfo.core === result.core
            ? { ...coreInfo, version: result.version }
            : coreInfo,
        );
      }, coresInfo);
    },
    [],
  );

  const refreshMihomoPermissions = useCallback(
    async (coresInfo: MihomoCoreInfo[]) => {
      if (enableGrantPermissions) {
        await refreshPermissionsGranted();
        const permissions = await Promise.all(
          MIHOMO_CORES.map(async (core) => {
            const granted = await checkPermissionsGranted(core);
            return { core, granted };
          }),
        );

        return permissions.reduce(
          (nextCoresInfo, { core, granted }) =>
            nextCoresInfo.map((coreInfo) =>
              coreInfo.core === core
                ? { ...coreInfo, permissionsGranted: granted }
                : coreInfo,
            ),
          coresInfo,
        );
      }
      return coresInfo;
    },
    [enableGrantPermissions],
  );

  return {
    mihomoCoresInfo,
    isLoading,
    enableGrantPermissions,
    muteMihomoCoresInfo,
  };
};
