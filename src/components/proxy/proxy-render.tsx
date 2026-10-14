import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import InboxRounded from "@mui/icons-material/InboxRounded";
import { alpha, Box, Card, Typography } from "@mui/material";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyInfo } from "tauri-plugin-mihomo-api";

import { useProfilesStore } from "@/stores";
import {
  createScopedHeadStateActions,
  DEFAULT_STATE,
} from "@/stores/proxyHeadStateStore";
import { cn } from "@/utils";
import { groupId } from "@/utils/proxyId";

import { ProxyGroupIcon } from "./proxy-group-icon";
import { ProxyGroupTools } from "./proxy-group-tools";
import { ProxyItem } from "./proxy-item";
import { ProxyItemMini } from "./proxy-item-mini";
import {
  type IProxyGroupItem,
  type IRenderItem,
  RenderType,
} from "./use-render-list";

interface RenderProps {
  item: IRenderItem;
  stickyed?: boolean;
  delayVersion: number;
  onLocation: (group: IProxyGroupItem) => void;
  onCheckAll: (groupName: string) => void;
  onGroupToggle?: (group: IProxyGroupItem) => void | Promise<void>;
  onChangeProxy: (group: IProxyGroupItem, proxy: ProxyInfo) => void;
  onGroupLocation: (groupName: string, highlight?: boolean) => void;
}

interface ProxyColProps {
  item: IRenderItem;
  delayVersion: number;
  onChangeProxy: (group: IProxyGroupItem, proxy: ProxyInfo) => void;
  onGroupLocation: (groupName: string, highlight?: boolean) => void;
}

interface ProxyGroupHeaderProps {
  group: IProxyGroupItem;
  headState: NonNullable<IRenderItem["headState"]>;
  stickyed?: boolean;
  onLocation: (group: IProxyGroupItem) => void;
  onCheckAll: (groupName: string) => void;
  onGroupToggle?: (group: IProxyGroupItem) => void | Promise<void>;
  onGroupLocation: (groupName: string, highlight?: boolean) => void;
}

const TOOLS_SX = { pr: 0.5 };

const ProxyGroupHeader = memo(function ProxyGroupHeader(
  props: ProxyGroupHeaderProps,
) {
  const {
    group,
    headState,
    stickyed,
    onLocation,
    onCheckAll,
    onGroupToggle,
    onGroupLocation,
  } = props;
  const currentProfileUid = useProfilesStore(
    (s) => s.currentProfile?.uid ?? "",
  );
  const headStateActions = useMemo(
    () =>
      createScopedHeadStateActions({
        current: currentProfileUid,
        groupName: group.name,
      }),
    [currentProfileUid, group.name],
  );
  const handleToggle = useCallback(async () => {
    if (headState.open) {
      await onGroupToggle?.(group);
    }
    headStateActions.setOpen(!headState.open);
  }, [group, headState.open, headStateActions, onGroupToggle]);
  const handleLocation = useCallback(() => {
    onLocation(group);
  }, [group, onLocation]);
  const handleCheckDelay = useCallback(() => {
    onCheckAll(group.name);
  }, [group.name, onCheckAll]);
  const handleGroupLocation = useCallback(
    (highlight: boolean = true) => {
      onGroupLocation(group.name, highlight);
    },
    [group.name, onGroupLocation],
  );

  return (
    <div className="py-1">
      <Card
        id={groupId(group.name)}
        className={cn(
          "interface-proxy-group mx-1 flex h-12 cursor-pointer items-center rounded-xl px-2",
          stickyed && headState.open && "shadow-md",
        )}
        sx={(theme) => {
          const { primary, background } = theme.palette;
          const isLight = theme.palette.mode === "light";
          const tint = alpha(primary.main, isLight ? 0.12 : 0.22);
          const elevation = isLight
            ? "0 1px 2px rgba(0,0,0,0.06)"
            : "0 1px 3px rgba(0,0,0,0.2)";
          return {
            backgroundColor: background.paper,
            backgroundImage: `linear-gradient(${tint}, ${tint})`,
            boxShadow: elevation,
            transition: "background-color 0s",
          };
        }}
        onClick={handleToggle}>
        <ProxyGroupIcon groupIcon={group.icon?.trim() ?? ""} />

        <Box className="flex min-w-0 flex-1 items-center gap-1.5 pr-1.5">
          <Typography
            noWrap
            title={group.name}
            style={{ fontSize: 14 }}
            sx={{
              minWidth: 0,
              maxWidth: "35%",
              fontSize: 14,
              fontWeight: 700,
              color: "text.primary",
            }}>
            {group.name}
          </Typography>
          <Typography
            color="text.secondary"
            style={{ fontSize: 10 }}
            sx={{
              flexShrink: 0,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 0.25,
              bgcolor: "action.hover",
              borderRadius: 1,
              px: 0.75,
              py: 0.25,
            }}>
            {group.type ?? "Unknown"}
          </Typography>
          <ChevronRightRounded
            sx={{ color: "text.disabled", fontSize: 16, flexShrink: 0 }}
          />
          <Typography
            noWrap
            title={group.now}
            color="primary.main"
            sx={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 500 }}>
            {group.now}
          </Typography>
        </Box>

        <Box className="interface-proxy-group-controls">
          <ProxyGroupTools
            sx={TOOLS_SX}
            stickyed={stickyed}
            groupName={group.name}
            onLocation={handleLocation}
            onCheckDelay={handleCheckDelay}
            onGroupLocation={handleGroupLocation}
          />
          {headState.open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
        </Box>
      </Card>
    </div>
  );
});

const ProxyItemMiniCol = memo(function ProxyItemMiniCol(props: ProxyColProps) {
  const { item, delayVersion, onChangeProxy, onGroupLocation } = props;
  const { group, headState, proxyCol } = item;
  return (
    <Box
      className="my-1 grid h-14 gap-2 px-4"
      style={{ gridTemplateColumns: `repeat(${item.col || 2}, 1fr)` }}>
      {proxyCol?.map((proxy) => (
        <ProxyItemMini
          key={item.key + proxy.name}
          group={group}
          proxy={proxy}
          fixed={group.fixed === proxy.name}
          selected={group.now === proxy.name}
          showType={headState?.showType}
          delayVersion={delayVersion}
          onClick={() => onChangeProxy(group, proxy)}
          onGroupLocation={onGroupLocation}
        />
      ))}
    </Box>
  );
});

const EmptyProxyMessage = memo(function EmptyProxyMessage() {
  const { t } = useTranslation();

  return (
    <Box className="flex flex-col items-center justify-center py-4 pl-0">
      <InboxRounded className="text-[2.5em] text-inherit" />
      <Typography className="text-inherit">
        {t("common.empty.noProxies")}
      </Typography>
    </Box>
  );
});

const isRenderPropsEqual = (prev: RenderProps, next: RenderProps) =>
  prev.item === next.item &&
  prev.stickyed === next.stickyed &&
  prev.delayVersion === next.delayVersion;

export const ProxyRender = memo(function ProxyRender(props: RenderProps) {
  const {
    item,
    stickyed,
    delayVersion,
    onLocation,
    onCheckAll,
    onGroupToggle,
    onChangeProxy,
    onGroupLocation,
  } = props;
  const { type, group, proxy, headState = DEFAULT_STATE } = item;

  switch (type) {
    case RenderType.GROUP_HEADER:
      return (
        <ProxyGroupHeader
          group={group}
          headState={headState}
          stickyed={stickyed}
          onLocation={onLocation}
          onCheckAll={onCheckAll}
          onGroupToggle={onGroupToggle}
          onGroupLocation={onGroupLocation}
        />
      );
    case RenderType.PROXY_ITEM:
      return (
        <ProxyItem
          group={group}
          proxy={proxy!}
          selected={group.now === proxy!.name}
          fixed={group.fixed === proxy!.name}
          showType={headState.showType}
          delayVersion={delayVersion}
          sx={{ py: "4px", px: 2 }}
          onClick={() => onChangeProxy(group, proxy!)}
          onGroupLocation={onGroupLocation}
        />
      );
    case RenderType.EMPTY_MESSAGE:
      return <EmptyProxyMessage />;
    case RenderType.PROXY_COL:
      return (
        <ProxyItemMiniCol
          item={item}
          delayVersion={delayVersion}
          onChangeProxy={onChangeProxy}
          onGroupLocation={onGroupLocation}
        />
      );
    default:
      return null;
  }
}, isRenderPropsEqual);
