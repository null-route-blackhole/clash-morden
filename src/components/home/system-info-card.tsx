import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Chip, Divider, IconButton, Stack, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { getVersion } from "@tauri-apps/api/app";
import { useLockFn } from "ahooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DnsOutlined as DnsOutlinedIcon } from "@/components/base/interface-icons";
import { SettingsOutlined as SettingsOutlinedIcon } from "@/components/base/interface-icons";
import { useNotice } from "@/components/base/notifies";
import { useService } from "@/hooks/use-service";
import { useUpdate } from "@/hooks/use-update";
import { getSystemInfo } from "@/services/cmds";
import { useVergeStore } from "@/stores";
import { getErrorMessage } from "@/utils";

import { EnhancedCard } from "./enhanced-card";

// 系统信息卡：OS / 自启动 / 运行模式 / 更新检查 / 版本
export const SystemInfoCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notice } = useNotice();
  const { serviceStatus } = useService();
  const enableAutoLaunch = useVergeStore(
    (s) => s.verge.enable_auto_launch ?? false,
  );
  const patchVerge = useVergeStore((s) => s.patchVerge);

  const { checkUpdate: triggerCheckUpdate, lastCheckUpdate } = useUpdate(true);

  const [osInfo, setOsInfo] = useState("-");
  const [appVersion, setAppVersion] = useState("-");

  const lastCheckUpdateText = useMemo(
    () => (lastCheckUpdate ? new Date(lastCheckUpdate).toLocaleString() : "-"),
    [lastCheckUpdate],
  );

  useEffect(() => {
    getSystemInfo()
      .then((info) => {
        const sysName = info.system_name;
        let sysVersion = info.system_version;

        if (
          sysName &&
          sysVersion?.toLowerCase().startsWith(sysName.toLowerCase())
        ) {
          sysVersion = sysVersion.substring(sysName.length).trim();
        }

        setOsInfo([sysName, sysVersion].filter(Boolean).join(" ") || "-");
      })
      .catch(console.error);

    getVersion().then(setAppVersion).catch(console.error);
  }, []);

  const goToSettings = useCallback(() => {
    void navigate({ to: "/settings" });
  }, [navigate]);

  const toggleAutoLaunch = useCallback(async () => {
    try {
      await patchVerge({ enable_auto_launch: !enableAutoLaunch });
    } catch (err) {
      notice("error", getErrorMessage(err));
    }
  }, [enableAutoLaunch, notice, patchVerge]);

  const onCheckUpdate = useLockFn(async () => {
    try {
      const result = await triggerCheckUpdate();
      const info = result.data;
      if (!info) {
        notice(
          "success",
          t("pages.home.components.systemInfo.notifications.upToDate"),
        );
      } else {
        notice(
          "info",
          t("pages.home.components.systemInfo.notifications.updateAvailable"),
        );
        goToSettings();
      }
    } catch (err) {
      notice("warning", getErrorMessage(err));
    }
  });

  // 运行模式徽章：由服务状态推导（active=服务模式；installed=服务已安装；
  // 其余=sidecar 模式）
  const getModeIcon = () => {
    switch (serviceStatus) {
      case "active":
        return (
          <DnsOutlinedIcon
            sx={{ color: "success.main", fontSize: 16 }}
            titleAccess={t(
              "pages.home.components.systemInfo.badges.serviceMode",
            )}
          />
        );
      case "installed":
        return (
          <AdminPanelSettingsOutlinedIcon
            sx={{ color: "primary.main", fontSize: 16 }}
            titleAccess={t(
              "pages.home.components.systemInfo.badges.adminServiceMode",
            )}
          />
        );
      default:
        return (
          <ExtensionOutlinedIcon
            sx={{ color: "info.main", fontSize: 16 }}
            titleAccess={t(
              "pages.home.components.systemInfo.badges.sidecarMode",
            )}
          />
        );
    }
  };

  const getModeText = () => {
    switch (serviceStatus) {
      case "active":
        return t("pages.home.components.systemInfo.badges.serviceMode");
      case "installed":
        return t("pages.home.components.systemInfo.badges.adminServiceMode");
      default:
        return t("pages.home.components.systemInfo.badges.sidecarMode");
    }
  };

  return (
    <EnhancedCard
      iconKind="server"
      title={t("pages.home.components.systemInfo.title")}
      icon={<InfoOutlinedIcon />}
      iconColor="error"
      action={
        <IconButton
          size="small"
          onClick={goToSettings}
          title={t("pages.home.components.systemInfo.actions.settings")}>
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      }>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.systemInfo.fields.osInfo")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            {osInfo}
          </Typography>
        </Stack>
        <Divider />
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.systemInfo.fields.autoLaunch")}
          </Typography>
          <Chip
            size="small"
            label={
              enableAutoLaunch
                ? t("common.status.enabled")
                : t("common.status.disabled")
            }
            color={enableAutoLaunch ? "success" : "default"}
            variant={enableAutoLaunch ? "filled" : "outlined"}
            onClick={toggleAutoLaunch}
            sx={{ cursor: "pointer" }}
          />
        </Stack>
        <Divider />
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.systemInfo.fields.runningMode")}
          </Typography>
          <Typography
            variant="body2"
            onClick={goToSettings}
            title={t("pages.home.components.systemInfo.actions.settings")}
            sx={{
              cursor: "pointer",
              textDecoration: "underline",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              fontWeight: "medium",
              "&:hover": { opacity: 0.7 },
            }}>
            {getModeIcon()}
            {getModeText()}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.systemInfo.fields.lastCheckUpdate")}
          </Typography>
          <Typography
            variant="body2"
            onClick={onCheckUpdate}
            sx={{
              cursor: "pointer",
              textDecoration: "underline",
              fontWeight: "medium",
              "&:hover": { opacity: 0.7 },
            }}>
            {lastCheckUpdateText}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.systemInfo.fields.vergeVersion")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: "medium" }}>
            v{appVersion}
          </Typography>
        </Stack>
      </Stack>
    </EnhancedCard>
  );
};
