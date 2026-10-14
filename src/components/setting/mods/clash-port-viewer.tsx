import { List, ListItem, ListItemText, TextField } from "@mui/material";
import { useLockFn } from "ahooks";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { getBaseConfig } from "tauri-plugin-mihomo-api";

import { BaseDialog, type DialogRef } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import { useClashInfo } from "@/hooks/use-clash";
import { checkPortAvailable } from "@/services/cmds";
import { mutate, swrKeys } from "@/services/swr";
import { getErrorMessage } from "@/utils";
import { OS } from "@/utils/get-system";
import { parseProxyPort } from "@/utils/proxy-port";

type PortKey =
  "mixed-port" | "socks-port" | "port" | "redir-port" | "tproxy-port";
const PORT_FIELDS: { key: PortKey; label: string }[] = [
  { key: "mixed-port", label: "Mixed Port" },
  { key: "socks-port", label: "Socks Port" },
  { key: "port", label: "Http Port" },
  ...(OS !== "windows"
    ? [{ key: "redir-port" as const, label: "Redir Port" }]
    : []),
  ...(OS === "linux"
    ? [{ key: "tproxy-port" as const, label: "Tproxy Port" }]
    : []),
];

export const ClashPortViewer = forwardRef<DialogRef>((_props, ref) => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const { clashInfo, patchInfo } = useClashInfo();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ports, setPorts] = useState<Record<PortKey, string>>({
    "mixed-port": "7890",
    "socks-port": "0",
    port: "0",
    "redir-port": "0",
    "tproxy-port": "0",
  });
  const savedPorts = {
    "mixed-port": clashInfo?.mixed_port ?? 7890,
    "socks-port": clashInfo?.socks_port ?? 0,
    port: clashInfo?.port ?? 0,
    "redir-port": clashInfo?.redir_port ?? 0,
    "tproxy-port": clashInfo?.tproxy_port ?? 0,
  };
  const invalid = PORT_FIELDS.some(
    ({ key }) => parseProxyPort(ports[key]) === undefined,
  );

  useImperativeHandle(ref, () => ({
    open: () => {
      setPorts(
        Object.fromEntries(
          Object.entries(savedPorts).map(([key, value]) => [
            key,
            String(value),
          ]),
        ) as Record<PortKey, string>,
      );
      setOpen(true);
    },
    close: () => setOpen(false),
  }));

  const onSave = useLockFn(async () => {
    if (invalid) return;
    const next = Object.fromEntries(
      PORT_FIELDS.map(({ key }) => [key, parseProxyPort(ports[key])!]),
    ) as Partial<Record<PortKey, number>>;
    const enabled = new Set<number>();
    for (const { key, label } of PORT_FIELDS) {
      const port = next[key]!;
      if (port !== 0 && enabled.has(port)) {
        notice(
          "error",
          t("messages.clash.portConflict", { portName: label }),
          4000,
        );
        return;
      }
      if (port !== 0) enabled.add(port);
    }
    const changed = PORT_FIELDS.filter(
      ({ key }) => next[key] !== savedPorts[key],
    );
    if (!changed.length) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      // Only ports actually used by Mihomo may bypass the occupancy check.
      // Saved values can differ after fallback or while the core is stopped.
      const runtime = await getBaseConfig().catch(() => undefined);
      const usingPorts = new Set(
        runtime
          ? [
              runtime.mixedPort,
              runtime.socksPort,
              runtime.port,
              runtime.redirPort,
              runtime.tproxyPort,
            ].filter((port) => port > 0)
          : [],
      );
      for (const { key, label } of changed) {
        const port = next[key]!;
        if (
          port !== 0 &&
          !usingPorts.has(port) &&
          !(await checkPortAvailable(port))
        ) {
          notice(
            "error",
            t("messages.clash.portConflict", { portName: label }),
            4000,
          );
          return;
        }
      }
      await patchInfo(
        Object.fromEntries(changed.map(({ key }) => [key, next[key]])),
      );
      await mutate(swrKeys.runtimeConfig);
      setOpen(false);
      notice("success", t("messages.clash.portModified"), 1000);
    } catch (err: unknown) {
      notice("error", getErrorMessage(err), 4000);
    } finally {
      setSaving(false);
    }
  });

  return (
    <BaseDialog
      open={open}
      title={t("pages.settings.clash.portConfig.dialogTitle")}
      maxWidth="xs"
      fullWidth
      okBtn={t("common.actions.save")}
      okDisabled={invalid || saving || !clashInfo}
      loading={saving}
      cancelBtn={t("common.actions.cancel")}
      onClose={() => {
        if (!saving) setOpen(false);
      }}
      onCancel={() => {
        if (!saving) setOpen(false);
      }}
      onOk={onSave}>
      <List>
        {PORT_FIELDS.map(({ key, label }) => {
          const error = parseProxyPort(ports[key]) === undefined;
          return (
            <ListItem
              key={key}
              sx={{ padding: "5px 2px", alignItems: "flex-start" }}>
              <ListItemText
                primary={label}
                sx={{ opacity: ports[key] === "0" ? 0.5 : 1 }}
              />
              <TextField
                size="small"
                autoComplete="off"
                disabled={saving}
                sx={{ width: 180 }}
                value={ports[key]}
                error={error}
                helperText={error ? t("messages.clash.invalidPort") : undefined}
                slotProps={{
                  htmlInput: { inputMode: "numeric", "aria-label": label },
                }}
                onChange={(e) =>
                  setPorts((previous) => ({
                    ...previous,
                    [key]: e.target.value,
                  }))
                }
              />
            </ListItem>
          );
        })}
      </List>
    </BaseDialog>
  );
});

export default ClashPortViewer;
