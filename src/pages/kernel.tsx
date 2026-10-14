import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BasePage, type DialogRef } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import {
  KernelFieldEditor,
  prepareField,
  toMapRows,
} from "@/components/kernel/field-editor";
import {
  fieldAvailable,
  kernelSections,
  type KernelTab,
  readPath,
  writePath,
} from "@/components/kernel/schema";
import DnsViewer from "@/components/setting/mods/dns-viewer";
import SettingClash from "@/components/setting/setting-clash";
import { useMihomoCoresInfo } from "@/hooks/use-mihomo-cores-info";
import { usePortable } from "@/hooks/use-portable";
import { useService } from "@/hooks/use-service";
import {
  getKernelSettings,
  getNetInfo,
  type KernelSettings,
  saveKernelSettings,
  syncSmartModel,
} from "@/services/cmds";
import { useVergeStore } from "@/stores";
import { getErrorMessage } from "@/utils";
import { OS } from "@/utils/get-system";

const modelBase =
  "https://github.com/vernesong/mihomo/releases/download/LightGBM-Model/";
const modelFiles = ["Model.bin", "Model-middle.bin", "Model-large.bin"];
const tabs: KernelTab[] = ["general", "network", "dns", "tun", "sniffer"];

const KernelPage = ({
  tab,
  onTabChange,
}: {
  tab: KernelTab;
  onTabChange: (tab: KernelTab) => void;
}) => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const dnsRef = useRef<DialogRef>(null);
  const { serviceStatus } = useService();
  const { portable } = usePortable();
  const { mihomoCoresInfo } = useMihomoCoresInfo();
  const activeCore = useVergeStore((s) => s.verge.clash_core ?? "self-mihomo");
  const canEnableTun =
    serviceStatus === "active" ||
    (OS === "linux" &&
      portable &&
      mihomoCoresInfo.some(
        (core) => core.core === activeCore && core.permissionsGranted,
      ));
  const randomPort = useVergeStore((s) => s.verge.enable_random_port ?? false);
  const [warningOpen, setWarningOpen] = useState(
    () => localStorage.getItem("kernel-warning-dismissed-v1") !== "true",
  );
  const [footerVisible, setFooterVisible] = useState(
    () => localStorage.getItem("kernel-footer-hidden-v1") !== "true",
  );
  const [footerConfirmOpen, setFooterConfirmOpen] = useState(false);
  const [settings, setSettings] = useState<KernelSettings | null>(null);
  const [interfaces, setInterfaces] = useState<NetInfo[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [changes, setChanges] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modelUrl, setModelUrl] = useState(modelBase + modelFiles[0]);
  const [syncing, setSyncing] = useState(false);
  const reload = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await getKernelSettings();
      getNetInfo()
        .then(setInterfaces)
        .catch((error) => setError(getErrorMessage(error)));
      const next: Record<string, unknown> = {};
      for (const section of Object.values(kernelSections).flat())
        for (const field of section.fields) {
          const value =
            readPath(result.saved, field.path) ??
            readPath(result.effective, field.path) ??
            field.fallback;
          next[field.path] =
            field.type === "map"
              ? toMapRows(value)
              : field.type === "select" && typeof value === "string"
                ? value.toLowerCase()
                : value;
        }
      setValues(next);
      setChanges({});
      setSettings(result);
      setModelUrl(
        String(
          result.saved["lgbm-url"] ??
            result.effective["lgbm-url"] ??
            modelBase + modelFiles[0],
        ),
      );
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const editState = useRef({ busy, changes });
  editState.current = { busy, changes };
  useEffect(() => {
    const unlisten = listen("verge://refresh-clash-config", () => {
      if (
        !editState.current.busy &&
        Object.keys(editState.current.changes).length === 0
      )
        void reload();
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [reload]);

  const save = async () => {
    if (busy || !settings) return;
    setBusy(true);
    setError("");
    try {
      const patch: Record<string, unknown> = {};
      for (const section of Object.values(kernelSections).flat())
        for (const field of section.fields)
          if (Object.hasOwn(changes, field.path)) {
            writePath(
              patch,
              field.path,
              prepareField(field, changes[field.path]),
            );
          }
      // On first enable, materialize suggested defaults that the profile does not define.
      for (const group of ["dns", "tun", "sniffer"] as const) {
        if (changes[`${group}.enable`] !== true) continue;
        for (const section of kernelSections[
          group === "sniffer" ? "sniffer" : group
        ])
          for (const field of section.fields) {
            if (
              !fieldAvailable(field) ||
              !field.path.startsWith(`${group}.`) ||
              Object.hasOwn(changes, field.path) ||
              readPath(settings.effective, field.path) != null
            )
              continue;
            writePath(
              patch,
              field.path,
              prepareField(
                field,
                values[field.path] ??
                  (field.type === "map" ? [] : field.fallback),
              ),
            );
          }
      }
      for (const protocol of ["HTTP", "TLS", "QUIC"]) {
        const path = `sniffer.sniff.${protocol}.ports`;
        if (
          !Object.hasOwn(changes, path) &&
          changes[`sniffer.sniff.${protocol}.override-destination`] != null &&
          readPath(settings.effective, path) == null
        )
          writePath(patch, path, values[path]);
      }
      if (Object.hasOwn(changes, "lgbm-url"))
        patch["lgbm-url"] = changes["lgbm-url"];
      await saveKernelSettings(patch);
      await reload();
      notice("success", t("messages.clash.configUpdated"));
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const update = (path: string, value: unknown) => {
    setValues((old) => ({ ...old, [path]: value }));
    setChanges((old) => ({ ...old, [path]: value }));
  };
  const syncModel = async () => {
    setSyncing(true);
    setError("");
    try {
      await syncSmartModel(modelUrl);
      notice("success", t("pages.kernel.modelSynced"));
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  };
  const sections = kernelSections[tab];
  const disabled = busy || syncing || !settings;
  const modelCard = (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}>
      <Typography sx={{ mb: 1.5, fontWeight: 700 }}>
        {t("pages.kernel.smart")}
      </Typography>
      <Stack spacing={1.5}>
        <TextField
          select
          size="small"
          label={t("pages.kernel.model")}
          value={
            modelFiles.includes(modelUrl.replace(modelBase, ""))
              ? modelUrl.replace(modelBase, "")
              : "custom"
          }
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value !== "custom") {
              const url = modelBase + e.target.value;
              setModelUrl(url);
              setChanges((old) => ({ ...old, "lgbm-url": url }));
            }
          }}>
          {modelFiles.map((file, index) => (
            <MenuItem key={file} value={file}>
              {t(`pages.kernel.models.${index}`)}
            </MenuItem>
          ))}
          <MenuItem value="custom">{t("pages.kernel.custom")}</MenuItem>
        </TextField>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="URL"
            value={modelUrl}
            disabled={disabled}
            onChange={(e) => {
              setModelUrl(e.target.value);
              setChanges((old) => ({ ...old, "lgbm-url": e.target.value }));
            }}
          />
          <Button
            disabled={disabled}
            loading={syncing}
            onClick={syncModel}
            sx={{ flexShrink: 0 }}>
            {t("pages.kernel.sync")}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t("pages.kernel.smartHint")}
        </Typography>
      </Stack>
    </Paper>
  );
  return (
    <BasePage
      full
      title={t("pages.kernel.title")}
      header={
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            minWidth: 0,
            flex: 1,
            justifyContent: "center",
          }}>
          <Tabs
            value={tab}
            onChange={(_, value: KernelTab) => onTabChange(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label={t("pages.kernel.title")}
            sx={{
              minHeight: 40,
              maxWidth: "min(52vw, 520px)",
              "& .MuiTab-root": { minWidth: 60, px: 1.5, minHeight: 40 },
            }}>
            {tabs.map((tab) => (
              <Tab
                key={tab}
                value={tab}
                label={t(`pages.kernel.tabs.${tab}`)}
              />
            ))}
          </Tabs>
          <Button disabled={busy || syncing} onClick={() => void reload()}>
            {t("common.actions.refresh")}
          </Button>
          <Button
            variant="contained"
            disabled={disabled || Object.keys(changes).length === 0}
            loading={busy && !!settings}
            onClick={save}>
            {t("common.actions.save")}
            {Object.keys(changes).length > 0
              ? ` (${Object.keys(changes).length})`
              : ""}
          </Button>
        </Stack>
      }
      contentStyle={{ display: "flex", flexDirection: "column" }}>
      <Dialog open={warningOpen} aria-labelledby="kernel-warning-title">
        <DialogTitle id="kernel-warning-title">
          {t("pages.kernel.warningTitle")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t("pages.kernel.warningBody")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              localStorage.setItem("kernel-warning-dismissed-v1", "true");
              setWarningOpen(false);
            }}>
            {t("pages.kernel.warningDismiss")}
          </Button>
          <Button variant="contained" onClick={() => setWarningOpen(false)}>
            {t("common.actions.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={footerConfirmOpen}
        onClose={() => setFooterConfirmOpen(false)}
        aria-labelledby="kernel-footer-confirm-title">
        <DialogTitle id="kernel-footer-confirm-title">
          {t("pages.kernel.footerDismissTitle")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("pages.kernel.footerDismissBody")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFooterConfirmOpen(false)}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              localStorage.setItem("kernel-footer-hidden-v1", "true");
              setFooterVisible(false);
              setFooterConfirmOpen(false);
            }}>
            {t("common.actions.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ p: 2, overflowY: "auto", flex: 1, minHeight: 0 }}>
        <Stack spacing={2} sx={{ maxWidth: 960, mx: "auto" }}>
          {error && <Alert severity="error">{error}</Alert>}
          {tab === "tun" && !canEnableTun && (
            <Alert severity="warning">
              {t("pages.settings.clash.tun.info")}
            </Alert>
          )}
          {tab === "general" && (
            <Paper
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}>
              <SettingClash
                section="general"
                onError={(error) => setError(getErrorMessage(error))}
              />
            </Paper>
          )}
          {tab === "dns" && (
            <Box>
              <Button
                disabled={disabled || Object.keys(changes).length > 0}
                onClick={() => dnsRef.current?.open()}>
                {t("pages.settings.clash.dns.advancedMode")}
              </Button>
              <DnsViewer ref={dnsRef} />
            </Box>
          )}
          {settings && ["dns", "tun", "sniffer"].includes(tab) && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2">
                {t("pages.kernel.effectiveState")}
              </Typography>
              <Chip
                size="small"
                color={
                  readPath(settings.effective, `${tab}.enable`) === true
                    ? "success"
                    : "default"
                }
                label={t(
                  readPath(settings.effective, `${tab}.enable`) === true
                    ? "common.status.enabled"
                    : "common.status.disabled",
                )}
              />
            </Stack>
          )}
          {!settings && busy && (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <CircularProgress />
            </Box>
          )}
          {sections.map((section, index) => {
            const fields = section.fields.filter(fieldAvailable);
            if (!fields.length) return null;
            return (
              <Box key={section.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}>
                  <Typography sx={{ mb: 1, fontWeight: 700 }}>
                    {t(`pages.kernel.sections.${section.id}`)}
                  </Typography>
                  {fields.map((field) => (
                    <KernelFieldEditor
                      key={field.path}
                      field={field}
                      value={values[field.path] ?? field.fallback}
                      interfaces={interfaces}
                      disabled={
                        disabled ||
                        (section.id === "ports" && randomPort) ||
                        (field.path === "tun.enable" &&
                          values[field.path] !== true &&
                          !canEnableTun)
                      }
                      source={
                        Object.hasOwn(changes, field.path)
                          ? changes[field.path] === null
                            ? "reset"
                            : "edited"
                          : readPath(settings?.saved ?? {}, field.path) != null
                            ? "override"
                            : readPath(settings?.effective ?? {}, field.path) !=
                                null
                              ? "config"
                              : "suggested"
                      }
                      inherited={
                        changes[field.path] === null ||
                        (!Object.hasOwn(changes, field.path) &&
                          readPath(settings?.saved ?? {}, field.path) == null)
                      }
                      onChange={(value) => update(field.path, value)}
                      onReset={() => {
                        setChanges((old) => ({ ...old, [field.path]: null }));
                        setValues((old) => ({
                          ...old,
                          [field.path]:
                            field.type === "map" ? [] : field.fallback,
                        }));
                      }}
                    />
                  ))}
                  {section.hint && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 1.5 }}>
                      {t(`pages.kernel.hints.${section.hint}`)}
                    </Typography>
                  )}
                </Paper>
                {tab === "general" && index === 0 && (
                  <Box sx={{ mt: 2 }}>{modelCard}</Box>
                )}
              </Box>
            );
          })}
          {tab === "network" && (
            <Paper
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}>
              <SettingClash
                section="network"
                onError={(error) => setError(getErrorMessage(error))}
              />
            </Paper>
          )}
          {footerVisible && (
            <Stack spacing={2}>
              <Alert
                severity="warning"
                closeText={t("common.actions.close")}
                onClose={() => setFooterConfirmOpen(true)}>
                {t("pages.kernel.warningBody")}
              </Alert>
              <Alert severity="info">{t("pages.kernel.scope")}</Alert>
            </Stack>
          )}
        </Stack>
      </Box>
    </BasePage>
  );
};
export default KernelPage;
