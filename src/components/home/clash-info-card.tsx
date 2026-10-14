import DeveloperBoardOutlinedIcon from "@mui/icons-material/DeveloperBoardOutlined";
import { Divider, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useClash } from "@/hooks/use-clash";
import { useMihomoCoresInfo } from "@/hooks/use-mihomo-cores-info";
import { useRulesStateStore, useVergeStore } from "@/stores";

import { EnhancedCard } from "./enhanced-card";

// 将毫秒转换为时:分:秒格式的函数
const formatUptime = (uptimeMs: number) => {
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const seconds = Math.floor((uptimeMs % 60000) / 1000);
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

// 应用（webview）运行时长，每秒刷新
const useAppUptime = () => {
  const [uptime, setUptime] = useState(() =>
    Math.floor(Date.now() - performance.timeOrigin),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setUptime(Math.floor(Date.now() - performance.timeOrigin)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  return uptime;
};

export const ClashInfoCard = () => {
  const { t } = useTranslation();
  const { clash } = useClash();
  const clashCore = useVergeStore((s) => s.verge.clash_core);
  const { mihomoCoresInfo: mihomoCores } = useMihomoCoresInfo();
  const rulesCount = useRulesStateStore((s) => s.rules.length);

  const coreVersion =
    mihomoCores.find((core) => core.core === (clashCore ?? "self-mihomo"))
      ?.version || "-";
  const uptime = useAppUptime();

  const formattedUptime = useMemo(() => formatUptime(uptime), [uptime]);

  const displayedMixedPort = (() => {
    const port = clash?.["mixed-port"] ?? clash?.port;
    return port ? String(port) : "-";
  })();

  const systemProxyAddress =
    displayedMixedPort === "-" ? "-" : `127.0.0.1:${displayedMixedPort}`;

  return (
    <EnhancedCard
      iconKind="server"
      title={t("pages.home.components.clashInfo.title")}
      icon={<DeveloperBoardOutlinedIcon />}
      iconColor="warning">
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.clashInfo.fields.coreVersion")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {coreVersion}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.clashInfo.fields.systemProxyAddress")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {systemProxyAddress}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.clashInfo.fields.mixedPort")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {displayedMixedPort}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.clashInfo.fields.uptime")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {formattedUptime}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.clashInfo.fields.rulesCount")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {rulesCount}
          </Typography>
        </Stack>
      </Stack>
    </EnhancedCard>
  );
};
