import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useLockFn } from "ahooks";
import {
  FileCode2,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BaseDialog } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import { OverviewIcon } from "@/components/home/overview-controls";
import { useMonacoEditor } from "@/hooks/use-monaco-editor";
import { downloadPluginScript } from "@/services/cmds";
import { loadGlobalScriptModule } from "@/services/global-script-runtime";
import {
  type GlobalScript,
  useGlobalScriptsStore,
} from "@/stores/globalScriptsStore";
import { getErrorMessage } from "@/utils";

import { ConfirmViewer } from "./confirm-viewer";
import { ProfileDiv } from "./profile-box";

const TEMPLATE = `// ==UserScript==
// @name My global script
// @description Runs in the application's web interface
// ==/UserScript==

// Styles are automatically removed when the script is stopped.
GM_addStyle(\`/* Add your CSS here */\`);

// Called now and whenever the page changes.
onRouteChange((pathname) => console.log("Page:", pathname));

// Use signal for event listeners and onCleanup for other resources:
// window.addEventListener("resize", handler, { signal });
// const timer = setInterval(handler, 1000);
// onCleanup(() => clearInterval(timer));
// GM_setValue("key", "value");
// console.log(GM_getValue("key", "default"));
`;

export const GlobalScriptsManager = () => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const scripts = useGlobalScriptsStore((state) => state.scripts);
  const statuses = useGlobalScriptsStore((state) => state.statuses);
  const logs = useGlobalScriptsStore((state) => state.logs);
  const save = useGlobalScriptsStore((state) => state.save);
  const toggle = useGlobalScriptsStore((state) => state.toggle);
  const remove = useGlobalScriptsStore((state) => state.remove);
  const clearLogs = useGlobalScriptsStore((state) => state.clearLogs);
  const [draft, setDraft] = useState<GlobalScript | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState<GlobalScript | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeProxy, setSubscribeProxy] = useState<
    "direct" | "system" | "app"
  >("direct");
  const [subscribeUrl, setSubscribeUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [scriptWarningOpen, setScriptWarningOpen] = useState(
    () => localStorage.getItem("plugin-script-warning-dismissed-v1") !== "true",
  );
  const [pendingScriptAction, setPendingScriptAction] = useState<
    (() => void) | null
  >(null);
  const confirmScriptAction = (action: () => void) => {
    if (localStorage.getItem("plugin-script-warning-dismissed-v1") === "true")
      action();
    else {
      setPendingScriptAction(() => action);
      setScriptWarningOpen(true);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const { editor, domRef, setModel } = useMonacoEditor({
    active: draft !== null,
    language: "javascript",
  });
  useEffect(() => {
    if (editor && draft)
      setModel(draft.code, {
        language: "javascript",
        uri: `${draft.id || "new"}.global-script.js`,
      });
  }, [editor, draft, setModel]);
  const edit = (script?: GlobalScript) => {
    const next = script ?? {
      id: "",
      name: t("pages.profiles.globalScripts.defaultName"),
      description: "",
      code: TEMPLATE,
      enabled: false,
    };
    setRemoteUrl(next.url ?? "");
    setName(next.name);
    setDescription(next.description);
    setDraft(next);
  };
  const submit = useLockFn(async () => {
    if (!draft || !editor || !name.trim()) return;
    setSaving(true);
    try {
      const code = editor.getValue();
      await loadGlobalScriptModule(code);
      save({
        ...draft,
        id: draft.id || undefined,
        name: name.trim(),
        description: description.trim(),
        code,
        url: remoteUrl.trim() || undefined,
      });
      setDraft(null);
    } catch (error) {
      notice("error", getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  });
  const importFile = async (file: File) => {
    try {
      const code = await file.text();
      const nextName =
        code.match(/^\s*\/\/\s*@name\s+(.+)$/m)?.[1]?.trim() ||
        file.name.replace(/\.js$/i, "");
      const nextDescription =
        code.match(/^\s*\/\/\s*@description\s+(.+)$/m)?.[1]?.trim() || "";
      edit({
        id: "",
        name: nextName,
        description: nextDescription,
        code,
        enabled: false,
      });
    } catch (error) {
      notice("error", getErrorMessage(error));
    }
  };
  const subscribe = async () => {
    setDownloading(true);
    try {
      const option = {
        with_proxy: subscribeProxy === "system",
        self_proxy: subscribeProxy === "app",
      };
      const code = await downloadPluginScript(subscribeUrl.trim(), option);
      await loadGlobalScriptModule(code);
      setSubscribeOpen(false);
      edit({
        id: "",
        name:
          code.match(/^\s*\/\/\s*@name\s+(.+)$/m)?.[1]?.trim() ||
          new URL(subscribeUrl).pathname.split("/").pop() ||
          "Plugin",
        description: "",
        code,
        enabled: false,
        url: subscribeUrl.trim(),
        option,
        updated: Date.now(),
      });
    } catch (error) {
      notice("error", getErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };
  const updateRemote = async (script: GlobalScript) => {
    if (!script.url || updating) return;
    setUpdating(script.id);
    try {
      const code = await downloadPluginScript(script.url, script.option);
      await loadGlobalScriptModule(code);
      const current = useGlobalScriptsStore
        .getState()
        .scripts.find((item) => item.id === script.id);
      if (current && current.url === script.url)
        save({ ...current, code, updated: Date.now() });
      notice("success", t("pages.profiles.remoteScript.updated"));
    } catch (error) {
      notice("error", getErrorMessage(error));
    } finally {
      setUpdating(null);
    }
  };
  return (
    <Box className="overview-design" sx={{ mt: 2, pb: 2 }}>
      <Divider
        variant="middle"
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "text.primary",
          mb: 1.5,
          mt: 3,
          "&::before, &::after": {
            borderTopWidth: 2,
            borderColor: "text.secondary",
          },
        }}>
        {t("pages.profiles.globalScripts.title")}
      </Divider>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1,
        }}>
        <Typography variant="caption" color="text.secondary">
          {t("pages.profiles.globalScripts.description")}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
          <Button
            size="small"
            startIcon={<RefreshCw size={14} />}
            onClick={() =>
              confirmScriptAction(() => {
                setSubscribeUrl("");
                setSubscribeOpen(true);
              })
            }>
            {t("pages.profiles.remoteScript.subscribe")}
          </Button>
          <Button
            size="small"
            startIcon={<Upload size={14} />}
            onClick={() => confirmScriptAction(() => fileRef.current?.click())}>
            {t("pages.profiles.globalScripts.import")}
          </Button>
          <Button
            size="small"
            startIcon={<Plus size={14} />}
            onClick={() => confirmScriptAction(() => edit())}>
            {t("common.actions.new")}
          </Button>
        </Box>
      </Box>
      <input
        ref={fileRef}
        type="file"
        accept=".js,text/javascript,application/javascript"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />
      {scripts.length === 0 ? (
        <Box sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
          <FilePlus2 size={24} />
          <Typography variant="body2">
            {t("pages.profiles.globalScripts.empty")}
          </Typography>
        </Box>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {scripts.map((script) => (
            <ProfileDiv
              key={script.id}
              className="interface-profile-card"
              aria-selected={script.enabled}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <FileCode2 size={16} />
                {script.url && (
                  <Button
                    size="small"
                    disabled={updating !== null}
                    loading={updating === script.id}
                    onClick={() => void updateRemote(script)}
                    aria-label={`${script.name}: ${t("common.actions.refresh")}`}>
                    <RefreshCw size={14} />
                  </Button>
                )}
                <Typography
                  noWrap
                  title={script.name}
                  sx={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }}>
                  {script.name}
                </Typography>
                <Typography
                  variant="caption"
                  color={script.enabled ? "success.main" : "text.secondary"}>
                  {t(
                    script.enabled
                      ? "common.status.enabled"
                      : "common.status.disabled",
                  )}
                </Typography>
                <Switch
                  size="small"
                  checked={script.enabled}
                  onChange={() => toggle(script.id)}
                  slotProps={{ input: { "aria-label": script.name } }}
                />
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", minHeight: 20 }}
                noWrap
                title={script.description}>
                {script.description || "—"}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                }}>
                <Typography
                  variant="caption"
                  color={
                    statuses[script.id]?.state === "error"
                      ? "error.main"
                      : "text.secondary"
                  }
                  title={statuses[script.id]?.message}>
                  {t(
                    `pages.profiles.globalScripts.${statuses[script.id]?.state ?? "stopped"}`,
                  )}
                </Typography>
                <Box sx={{ display: "flex" }}>
                  <OverviewIcon
                    label={t("common.actions.edit")}
                    onClick={() => edit(script)}>
                    <Pencil />
                  </OverviewIcon>
                  <OverviewIcon
                    label={t("pages.profiles.globalScripts.logs")}
                    onClick={() => setLogId(script.id)}>
                    <Terminal />
                  </OverviewIcon>
                  <OverviewIcon
                    label={t("common.actions.delete")}
                    onClick={() => setDeleting(script)}>
                    <Trash2 />
                  </OverviewIcon>
                </Box>
              </Box>
            </ProfileDiv>
          ))}
        </div>
      )}
      <BaseDialog
        title="脚本安全提示"
        open={scriptWarningOpen}
        onClose={() => setScriptWarningOpen(false)}
        onCancel={() => setScriptWarningOpen(false)}
        onOk={() => {
          localStorage.setItem("plugin-script-warning-dismissed-v1", "true");
          setScriptWarningOpen(false);
          pendingScriptAction?.();
          setPendingScriptAction(null);
        }}>
        <Typography sx={{ py: 1 }}>
          请不要安装不了解的脚本，也不要订阅来源不明的脚本。脚本可能读取或修改应用配置，请确认来源可信后再继续。
        </Typography>
      </BaseDialog>
      <BaseDialog
        title={t("pages.profiles.remoteScript.subscribe")}
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        onCancel={() => setSubscribeOpen(false)}
        onOk={subscribe}
        loading={downloading}
        okDisabled={!subscribeUrl.trim() || downloading}>
        <TextField
          label="URL"
          value={subscribeUrl}
          fullWidth
          size="small"
          sx={{ mt: 1 }}
          onChange={(event) => setSubscribeUrl(event.target.value)}
        />
        <FormControlLabel
          label={t("pages.profiles.remoteScript.systemProxy")}
          control={
            <Switch
              checked={subscribeProxy === "system"}
              onChange={(_, checked) =>
                setSubscribeProxy(checked ? "system" : "direct")
              }
            />
          }
        />
        <FormControlLabel
          label={t("pages.profiles.remoteScript.appProxy")}
          control={
            <Switch
              checked={subscribeProxy === "app"}
              onChange={(_, checked) =>
                setSubscribeProxy(checked ? "app" : "direct")
              }
            />
          }
        />
      </BaseDialog>
      <BaseDialog
        title={t("pages.profiles.globalScripts.edit")}
        open={draft !== null}
        fullWidth
        maxWidth="md"
        onClose={() => setDraft(null)}
        onCancel={() => setDraft(null)}
        onOk={submit}
        okBtn={t("common.actions.save")}
        loading={saving}
        okDisabled={!editor || !name.trim() || saving}>
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <TextField
            size="small"
            label={t("common.fields.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label={t("common.fields.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            fullWidth
          />
        </Box>
        <TextField
          label={t("pages.profiles.remoteScript.url")}
          value={remoteUrl}
          size="small"
          fullWidth
          sx={{ mb: 1 }}
          onChange={(event) => setRemoteUrl(event.target.value)}
        />
        <Typography variant="caption" color="text.secondary">
          {t("pages.profiles.globalScripts.help")}
        </Typography>
        <div ref={domRef} style={{ height: "55vh", marginTop: 8 }} />
      </BaseDialog>
      <BaseDialog
        title={t("pages.profiles.globalScripts.logs")}
        open={logId !== null}
        fullWidth
        maxWidth="md"
        hideOkBtn
        cancelBtn={t("common.actions.close")}
        onClose={() => setLogId(null)}
        onCancel={() => setLogId(null)}>
        <Button size="small" onClick={() => logId && clearLogs(logId)}>
          {t("common.actions.clear")}
        </Button>
        <Box
          component="pre"
          sx={{
            m: 0,
            py: 1,
            maxHeight: "50vh",
            overflow: "auto",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}>
          {logId &&
            (logs[logId] ?? [])
              .map(
                (log) =>
                  `[${new Date(log.time).toLocaleTimeString()}] ${log.level}: ${log.message}`,
              )
              .join("\n")}
        </Box>
      </BaseDialog>
      <ConfirmViewer
        title={t("common.actions.delete")}
        message={t("pages.profiles.globalScripts.confirmDelete", {
          name: deleting?.name,
        })}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting.id);
          setDeleting(null);
        }}
      />
    </Box>
  );
};
