import { Box, Menu, MenuItem } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useLockFn } from "ahooks";
import {
  CircleAlert,
  CircleCheck,
  FolderArchive,
  Pencil,
  Power,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { closeAllConnections } from "tauri-plugin-mihomo-api";

import { BaseDialog } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import {
  OverviewIcon,
  OverviewSegment,
  OverviewToggle,
} from "@/components/home/overview-controls";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { useClash, useClashInfo } from "@/hooks/use-clash";
import { useService } from "@/hooks/use-service";
import { restartSidecar } from "@/services/cmds";
import { useProfilesStore, useVergeStore } from "@/stores";
import { useSidebarStore } from "@/stores/sidebarStore";
import { cn, getErrorMessage } from "@/utils";
import { OS } from "@/utils/get-system";

const MODE_LIST = ["rule", "global", "direct"];

interface Props {
  /** 内核是否在运行（探活结果） */
  coreRunning: boolean;
  /** 当前选择的内核是否已安装 */
  coreInstalled: boolean;
  /** 正在探测本机已安装内核 */
  coreStatusLoading: boolean;
  editing: boolean;
  onEdit: () => void;
  /** 内核启停进行中（按钮禁用 + 图标转圈） */
  coreBusy: boolean;
  onToggleCore: () => void;
}

/**
 * 首页顶栏（图标化）：订阅切换（档案袋图标）/ 代理模式 / Tun / 系统代理 / 内核启动／关闭。
 * 开启亮色、关闭暗色，悬浮提示说明。
 */
export const OverviewTopbar = ({
  coreRunning,
  coreInstalled,
  coreStatusLoading,
  editing,
  onEdit,
  coreBusy,
  onToggleCore,
}: Props) => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const [restarting, setRestarting] = useState(false);
  const restart = useLockFn(async () => {
    setRestarting(true);
    try {
      await restartSidecar();
    } catch (err) {
      notice("error", getErrorMessage(err));
    } finally {
      setRestarting(false);
    }
  });
  const navigate = useNavigate();
  const { clash, patchClash } = useClash();
  const { clashInfo, patchInfo, mutateInfo } = useClashInfo();
  const { serviceStatus } = useService();
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const patchVerge = useVergeStore((s) => s.patchVerge);
  const enableSystemProxy = useVergeStore(
    (s) => s.verge.enable_system_proxy ?? false,
  );
  const autoCloseConnection = useVergeStore(
    (s) => s.verge.auto_close_connection ?? true,
  );
  const sidebarMode = useSidebarStore((s) => s.mode);
  const topbarOffset =
    OS === "macos"
      ? sidebarMode === "hidden"
        ? 70
        : sidebarMode === "collapsed"
          ? 24
          : 0
      : 0;

  const currentProfile = useProfilesStore((s) => s.currentProfile);
  const profileItems = useProfilesStore((s) => s.profileItems);
  const patchProfiles = useProfilesStore((s) => s.patchConfig);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);

  const curMode = clashInfo?.mode?.toLowerCase() ?? "rule";

  const onChangeMode = useLockFn(async (mode: string) => {
    await patchInfo({ mode });
    mutateInfo();
    if (mode !== curMode && autoCloseConnection) {
      closeAllConnections();
    }
  });

  const tunEnabled = !!clash?.tun?.enable;

  // Tun 开启需要服务模式（macOS 提权）；未安装/未运行时提醒去内核通用设置
  const toggleTun = (checked: boolean) => {
    if (checked && serviceStatus !== "active") {
      setServiceDialogOpen(true);
      return;
    }
    void patchClash({ tun: { enable: checked } });
  };

  return (
    <Box
      className={cn(
        "overview-design overview-topbar flex h-12.5 shrink-0 items-center gap-3",
      )}
      data-tauri-drag-region="deep"
      sx={{
        userSelect: "none",
        pl: `${topbarOffset + 8}px`,
        pr: "8px",
      }}>
      <SidebarToggle />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          color: coreStatusLoading
            ? "text.secondary"
            : !coreInstalled
            ? "warning.main"
            : coreRunning
              ? "success.main"
              : "text.secondary",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
          cursor:
            !coreInstalled && !coreStatusLoading ? "pointer" : "default",
        }}
        title={t(
          coreStatusLoading
            ? "pages.home.topbar.coreChecking"
            : !coreInstalled
            ? "pages.home.topbar.coreMissing"
            : coreRunning
              ? "pages.home.topbar.coreRunning"
              : "pages.home.topbar.coreStopped",
        )}
        onClick={() => {
          if (!coreInstalled && !coreStatusLoading)
            void navigate({ to: "/kernel", search: { tab: "general" } });
        }}
        onKeyDown={(event) => {
          if (
            !coreInstalled &&
            !coreStatusLoading &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            void navigate({ to: "/kernel", search: { tab: "general" } });
          }
        }}
        role={!coreInstalled && !coreStatusLoading ? "button" : undefined}
        tabIndex={!coreInstalled && !coreStatusLoading ? 0 : undefined}>
        {!coreInstalled || !coreRunning ? (
          <CircleAlert size={15} />
        ) : (
          <CircleCheck size={15} />
        )}
        <span>
          {t(
            coreStatusLoading
              ? "pages.home.topbar.coreChecking"
              : !coreInstalled
              ? "pages.home.topbar.coreMissing"
              : coreRunning
                ? "pages.home.topbar.coreRunning"
                : "pages.home.topbar.coreStopped",
          )}
        </span>
      </Box>
      <div className="ds-tools">
        <OverviewIcon
          label={currentProfile?.name || t("navigation.sidebar.profiles")}
          onClick={(event) => {
            setProfileAnchor(event.currentTarget);
            setProfileMenuOpen(true);
          }}>
          <FolderArchive />
        </OverviewIcon>
        <OverviewToggle
          label={t("pages.settings.system.proxy.label")}
          value={enableSystemProxy}
          onChange={(enable) =>
            void patchVerge({ enable_system_proxy: enable })
          }
        />
        <OverviewToggle
          label={t("pages.settings.clash.tun.label")}
          value={tunEnabled}
          onChange={toggleTun}
        />
        <OverviewSegment
          label={t("pages.home.components.currentProxy.title")}
          options={MODE_LIST.map((mode) => ({
            value: mode,
            label: t(`pages.proxies.modes.${mode}`),
          }))}
          value={curMode}
          onChange={onChangeMode}
        />
        <OverviewIcon
          label={t("common.actions.restart")}
          disabled={coreBusy || restarting}
          onClick={restart}>
          <RefreshCw className={restarting ? "animate-spin" : undefined} />
        </OverviewIcon>
        <OverviewIcon
          label={t("pages.home.edit.hint")}
          active={editing}
          onClick={onEdit}>
          <Pencil />
        </OverviewIcon>
        <OverviewIcon
          label={t(
            coreRunning ? "common.actions.disable" : "common.actions.enable",
          )}
          active={coreRunning}
          disabled={coreBusy || restarting}
          onClick={onToggleCore}>
          <Power />
        </OverviewIcon>
      </div>
      <Menu
        anchorEl={profileAnchor}
        open={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        {profileItems.map((item) => (
          <MenuItem
            key={item.uid}
            selected={item.uid === currentProfile?.uid}
            onClick={async () => {
              setProfileMenuOpen(false);
              if (item.uid !== currentProfile?.uid) {
                await patchProfiles({ current: item.uid });
              }
            }}>
            {item.name}
          </MenuItem>
        ))}
      </Menu>

      {/* Tun 需要服务模式的提醒 */}
      <BaseDialog
        open={serviceDialogOpen}
        title={t("pages.settings.clash.tun.label")}
        onOk={() => {
          setServiceDialogOpen(false);
          void navigate({ to: "/kernel", search: { tab: "general" } });
        }}
        onCancel={() => setServiceDialogOpen(false)}
        onClose={() => setServiceDialogOpen(false)}>
        {t("pages.home.topbar.tunRequiresService")}
      </BaseDialog>
    </Box>
  );
};
