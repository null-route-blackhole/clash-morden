import Settings from "@mui/icons-material/Settings";
import {
  Button,
  IconButton,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushDNS, flushFakeIp, updateGeo } from "tauri-plugin-mihomo-api";

import { type DialogRef, SwitchLovely } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import { useClash } from "@/hooks/use-clash";
import { useMihomoCoresInfo } from "@/hooks/use-mihomo-cores-info";
import { useService } from "@/hooks/use-service";
import { invoke_uwp_tool } from "@/services/cmds";
import { useClashLogStore, useVergeStore } from "@/stores";
import { getErrorMessage } from "@/utils";
import { OS } from "@/utils/get-system";

import ClashCoreViewer from "./mods/clash-core-viewer";
import ControllerViewer from "./mods/controller-viewer";
import { GuardState } from "./mods/guard-state";
import NetInfoViewer from "./mods/net-info-viewer";
import ServiceViewer from "./mods/service-viewer";
import { SettingItem, SettingList } from "./mods/setting-comp";
import WebUIViewer from "./mods/web-ui-viewer";

type Viewer = "core" | "controller" | "service" | "web" | "netInfo";
interface Props {
  onError: (err: Error) => void;
  section?: "general" | "network";
}
const SettingClash = ({ onError, section = "general" }: Props) => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const { clash, patchClash } = useClash();
  const clashCore = useVergeStore((s) => s.verge.clash_core ?? "self-mihomo");
  const serviceMode = useVergeStore(
    (s) => s.verge.enable_service_mode ?? false,
  );
  const randomPort = useVergeStore((s) => s.verge.enable_random_port ?? false);
  const externalController = useVergeStore(
    (s) => s.verge.enable_external_controller ?? false,
  );
  const patchVerge = useVergeStore((s) => s.patchVerge);
  const { serviceStatus, mutateCheckService } = useService();
  const { mihomoCoresInfo } = useMihomoCoresInfo();
  const coreVersion =
    mihomoCoresInfo.find((core) => core.core === clashCore)?.version ??
    "Unknown";
  const setLogLevel = useClashLogStore((s) => s.setLogLevel);
  const coreRef = useRef<DialogRef>(null),
    controllerRef = useRef<DialogRef>(null),
    serviceRef = useRef<DialogRef>(null),
    webRef = useRef<DialogRef>(null),
    netInfoRef = useRef<DialogRef>(null);
  const refs = useMemo(
    () => ({
      core: coreRef,
      controller: controllerRef,
      service: serviceRef,
      web: webRef,
      netInfo: netInfoRef,
    }),
    [],
  );
  const [mounted, setMounted] = useState<Partial<Record<Viewer, boolean>>>({});
  const pending = useRef<Viewer | null>(null);
  const openViewer = (viewer: Viewer) => {
    if (mounted[viewer]) refs[viewer].current?.open();
    else {
      pending.current = viewer;
      setMounted((old) => ({ ...old, [viewer]: true }));
    }
  };
  useEffect(() => {
    if (pending.current && mounted[pending.current]) {
      refs[pending.current].current?.open();
      pending.current = null;
    }
  }, [mounted, refs]);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      notice("success", t("messages.clash.configUpdated"));
    } catch (error) {
      onError(new Error(getErrorMessage(error)));
    }
  };
  return (
    <SettingList
      title={t(
        section === "general"
          ? "pages.kernel.coreManagement"
          : "pages.kernel.networkTools",
      )}>
      {mounted.core && (
        <ClashCoreViewer
          ref={coreRef}
          serviceActive={serviceStatus === "active"}
        />
      )}
      {mounted.controller && <ControllerViewer ref={controllerRef} />}
      {mounted.service && (
        <ServiceViewer ref={serviceRef} enable={serviceMode} />
      )}
      {mounted.web && <WebUIViewer ref={webRef} />}
      {mounted.netInfo && <NetInfoViewer ref={netInfoRef} />}
      {section === "general" ? (
        <>
          <SettingItem
            label={t("pages.settings.clash.core.label")}
            extra={
              <IconButton
                size="small"
                aria-label={t("pages.settings.clash.core.label")}
                onClick={() => openViewer("core")}>
                <Settings fontSize="small" />
              </IconButton>
            }>
            <Typography variant="body2">{coreVersion}</Typography>
          </SettingItem>
          <SettingItem
            label={t("pages.settings.clash.serviceMode.label")}
            extra={
              <IconButton
                size="small"
                aria-label={t("pages.settings.clash.serviceMode.label")}
                onClick={() => openViewer("service")}>
                <Settings fontSize="small" />
              </IconButton>
            }>
            <GuardState
              value={serviceMode}
              valueProps="checked"
              onCatch={onError}
              onFormat={(_, value: boolean) => value}
              onGuard={(value) => patchVerge({ enable_service_mode: value })}
              onSuccess={() => mutateCheckService()}>
              <SwitchLovely
                edge="end"
                disabled={
                  serviceStatus !== "active" && serviceStatus !== "installed"
                }
              />
            </GuardState>
          </SettingItem>
          <SettingItem label={t("pages.settings.clash.logLevel")}>
            <GuardState
              value={clash?.["log-level"] ?? "info"}
              onCatch={onError}
              onFormat={(e) => e.target.value}
              onGuard={(value) => {
                setLogLevel(value);
                return patchClash({ "log-level": value });
              }}>
              <Select size="small">
                {["debug", "info", "warning", "error", "silent"].map(
                  (value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ),
                )}
              </Select>
            </GuardState>
          </SettingItem>
          <SettingItem
            onClick={() => void action(updateGeo)}
            label={t("pages.settings.clash.updateGeoData")}
          />
          <SettingItem
            onClick={() => void action(flushFakeIp)}
            label={t("pages.settings.clash.flushCache", { cache: "Fake-IP" })}
          />
          <SettingItem
            onClick={() => void action(flushDNS)}
            label={t("pages.settings.clash.flushCache", { cache: "DNS" })}
          />
        </>
      ) : (
        <>
          <SettingItem label={t("pages.settings.clash.portConfig.randomPort")}>
            <GuardState
              value={randomPort}
              valueProps="checked"
              onCatch={onError}
              onFormat={(_, value: boolean) => value}
              onGuard={async (value) => {
                await patchClash({ "enable-random-port": value });
                await patchVerge({ enable_random_port: value });
              }}>
              <SwitchLovely edge="end" />
            </GuardState>
          </SettingItem>
          <SettingItem
            label={t("pages.settings.clash.externalController.label")}
            extra={
              <IconButton
                size="small"
                aria-label={t("pages.settings.clash.externalController.label")}
                onClick={() => openViewer("controller")}>
                <Settings fontSize="small" />
              </IconButton>
            }>
            <GuardState
              value={externalController}
              valueProps="checked"
              onCatch={onError}
              onFormat={(_, value: boolean) => value}
              onGuard={(value) =>
                patchVerge({ enable_external_controller: value })
              }>
              <SwitchLovely edge="end" />
            </GuardState>
          </SettingItem>
          <SettingItem
            openMoreSettings
            onClick={() => openViewer("web")}
            label={t("pages.settings.clash.webUi.label")}
          />
          <SettingItem
            openMoreSettings
            onClick={() => openViewer("netInfo")}
            label={t("pages.settings.clash.networkInterfaceInfo")}
          />
          {OS === "windows" && (
            <SettingItem
              label={t("pages.settings.clash.openUwpTool")}
              onClick={() =>
                void invoke_uwp_tool().catch((error) =>
                  onError(new Error(getErrorMessage(error))),
                )
              }
            />
          )}
          <SettingItem label={t("pages.kernel.refreshInterfaces")}>
            <Button size="small" onClick={() => openViewer("netInfo")}>
              {t("common.actions.view")}
            </Button>
          </SettingItem>
        </>
      )}
    </SettingList>
  );
};
export default SettingClash;
