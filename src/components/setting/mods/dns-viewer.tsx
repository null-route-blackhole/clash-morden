import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import { parse as load, stringify as dump } from "yaml";

import { BaseDialog, type DialogRef } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import { getDnsSettings, saveDnsSettings } from "@/services/cmds";
import { getErrorMessage } from "@/utils";

const serverFields = [
  "default-nameserver",
  "nameserver",
  "fallback",
  "proxy-server-nameserver",
  "direct-nameserver",
] as const;
type ServerField = (typeof serverFields)[number];
type ServerDraft = Record<ServerField, { override: boolean; text: string }>;
const emptyServers = Object.fromEntries(
  serverFields.map((key) => [key, { override: false, text: "" }]),
) as ServerDraft;

type Choice = "inherit" | "true" | "false";
type DnsDraft = {
  enable: Choice;
  ipv6: Choice;
  listen: string;
  mode: "inherit" | "fake-ip" | "redir-host";
  range: string;
  range6: string;
  filterMode: "inherit" | "blacklist" | "whitelist";
  filterOverride: boolean;
  filter: string;
  servers: ServerDraft;
  "respect-rules": Choice;
  "prefer-h3": Choice;
  "direct-nameserver-follow-policy": Choice;
  policyOverride: boolean;
  policy: string;
  fallbackOverride: boolean;
  fallback: string;
  hostsOverride: boolean;
  hosts: string;
  "use-hosts": Choice;
  "use-system-hosts": Choice;
};
const initial: DnsDraft = {
  enable: "inherit",
  ipv6: "inherit",
  listen: "",
  mode: "inherit",
  range: "",
  range6: "",
  filterMode: "inherit",
  filterOverride: false,
  filter: "",
  servers: emptyServers,
  "respect-rules": "inherit",
  "prefer-h3": "inherit",
  "direct-nameserver-follow-policy": "inherit",
  policyOverride: false,
  policy: "",
  fallbackOverride: false,
  fallback: "",
  hostsOverride: false,
  hosts: "",
  "use-hosts": "inherit",
  "use-system-hosts": "inherit",
};
const choice = (value: unknown): Choice =>
  typeof value === "boolean" ? (value ? "true" : "false") : "inherit";

type DnsPatch = Parameters<typeof saveDnsSettings>[0];
type Hosts = Parameters<typeof saveDnsSettings>[1];
const toDraft = (saved: Record<string, unknown>, hosts: unknown): DnsDraft => {
  const mode = saved["enhanced-mode"];
  const filterMode = saved["fake-ip-filter-mode"];
  const filter = saved["fake-ip-filter"];
  return {
    "respect-rules": choice(saved["respect-rules"]),
    "prefer-h3": choice(saved["prefer-h3"]),
    "direct-nameserver-follow-policy": choice(
      saved["direct-nameserver-follow-policy"],
    ),
    hostsOverride: hosts != null,
    hosts: hosts != null ? dump(hosts) : "",
    "use-hosts": choice(saved["use-hosts"]),
    "use-system-hosts": choice(saved["use-system-hosts"]),
    fallbackOverride: saved["fallback-filter"] != null,
    fallback:
      saved["fallback-filter"] != null ? dump(saved["fallback-filter"]) : "",
    policyOverride: saved["nameserver-policy"] != null,
    policy:
      saved["nameserver-policy"] != null
        ? dump(saved["nameserver-policy"])
        : "",
    servers: Object.fromEntries(
      serverFields.map((key) => [
        key,
        {
          override: Array.isArray(saved[key]),
          text: Array.isArray(saved[key]) ? saved[key].join("\n") : "",
        },
      ]),
    ) as ServerDraft,
    range:
      typeof saved["fake-ip-range"] === "string" ? saved["fake-ip-range"] : "",
    range6:
      typeof saved["fake-ip-range6"] === "string"
        ? saved["fake-ip-range6"]
        : "",
    filterMode:
      filterMode === "blacklist" || filterMode === "whitelist"
        ? filterMode
        : "inherit",
    filterOverride: Array.isArray(filter),
    filter: Array.isArray(filter) ? filter.join("\n") : "",
    enable: choice(saved.enable),
    ipv6: choice(saved.ipv6),
    listen: typeof saved.listen === "string" ? saved.listen : "",
    mode: mode === "fake-ip" || mode === "redir-host" ? mode : "inherit",
  };
};
const buildSettings = (values: DnsDraft, message: string) => {
  const policy = values.policyOverride
    ? load(values.policy.trim() || "{}")
    : null;
  if (
    values.policyOverride &&
    (policy === null || typeof policy !== "object" || Array.isArray(policy))
  ) {
    throw new Error(message);
  }
  const fallback = values.fallbackOverride
    ? load(values.fallback.trim() || "{}")
    : null;
  if (
    values.fallbackOverride &&
    (fallback === null ||
      typeof fallback !== "object" ||
      Array.isArray(fallback))
  ) {
    throw new Error(message);
  }
  const hosts = values.hostsOverride ? load(values.hosts.trim() || "{}") : null;
  if (
    values.hostsOverride &&
    (hosts === null || typeof hosts !== "object" || Array.isArray(hosts))
  ) {
    throw new Error(message);
  }
  return [
    {
      "use-hosts":
        values["use-hosts"] === "inherit"
          ? null
          : values["use-hosts"] === "true",
      "use-system-hosts":
        values["use-system-hosts"] === "inherit"
          ? null
          : values["use-system-hosts"] === "true",
      "fallback-filter": fallback as {
        geoip?: boolean;
        "geoip-code"?: string;
        ipcidr?: string[];
        domain?: string[];
        geosite?: string[];
      } | null,
      "nameserver-policy": policy as Record<string, string | string[]> | null,
      "respect-rules":
        values["respect-rules"] === "inherit"
          ? null
          : values["respect-rules"] === "true",
      "prefer-h3":
        values["prefer-h3"] === "inherit"
          ? null
          : values["prefer-h3"] === "true",
      "direct-nameserver-follow-policy":
        values["direct-nameserver-follow-policy"] === "inherit"
          ? null
          : values["direct-nameserver-follow-policy"] === "true",
      ...(Object.fromEntries(
        serverFields.map((key) => [
          key,
          values.servers[key].override
            ? values.servers[key].text
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
            : null,
        ]),
      ) as Record<ServerField, string[] | null>),
      enable: values.enable === "inherit" ? null : values.enable === "true",
      ipv6: values.ipv6 === "inherit" ? null : values.ipv6 === "true",
      listen: values.listen.trim() || null,
      "enhanced-mode": values.mode === "inherit" ? null : values.mode,
      "fake-ip-range": values.range.trim() || null,
      "fake-ip-range6": values.range6.trim() || null,
      "fake-ip-filter-mode":
        values.filterMode === "inherit" ? null : values.filterMode,
      "fake-ip-filter": values.filterOverride
        ? values.filter
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : null,
    },
    hosts as Record<string, string | string[]> | null,
  ] as const;
};
const parseAdvanced = (
  text: string,
  message: string,
): readonly [DnsPatch, Hosts] => {
  const document = load(text.trim() || "{}");
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    Object.keys(document).some((key) => key !== "dns" && key !== "hosts")
  ) {
    throw new Error(message);
  }
  const dns = document.dns ?? {};
  const hosts = document.hosts ?? null;
  if (typeof dns !== "object" || Array.isArray(dns)) throw new Error(message);
  const rebuilt = buildSettings(toDraft(dns, hosts), message);
  // Reject values that the form cannot represent rather than silently dropping them.
  for (const [key, value] of Object.entries(dns)) {
    if (
      !Object.hasOwn(rebuilt[0], key) ||
      JSON.stringify(value) !==
        JSON.stringify(rebuilt[0][key as keyof DnsPatch])
    ) {
      throw new Error(`${message}: dns.${key}`);
    }
  }
  return rebuilt;
};

export const DnsViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation();
  const { notice } = useNotice();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<DnsDraft>(initial);
  const [advanced, setAdvanced] = useState(false);
  const [yaml, setYaml] = useState("");
  const [effective, setEffective] = useState<Record<string, unknown>>({});

  const close = () => {
    if (!busy) setOpen(false);
  };

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
      setBusy(true);
      setLoaded(false);
      setError("");
      getDnsSettings()
        .then(({ saved, effective, hosts }) => {
          setValues(toDraft(saved, hosts));
          setAdvanced(false);
          setYaml("");
          setEffective(effective);
          setLoaded(true);
        })
        .catch((error: unknown) => setError(getErrorMessage(error)))
        .finally(() => setBusy(false));
    },
    close,
  }));

  const save = async () => {
    if (busy || !loaded) return;
    setBusy(true);
    setError("");
    try {
      const [patch, hosts] = advanced
        ? parseAdvanced(yaml, t("pages.settings.clash.dns.invalidAdvanced"))
        : buildSettings(values, t("pages.settings.clash.dns.invalidPolicy"));
      await saveDnsSettings(patch, hosts);
      setOpen(false);
      notice("success", t("messages.clash.configUpdated"));
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setError("");
    try {
      if (advanced) {
        const [dns, hosts] = parseAdvanced(
          yaml,
          t("pages.settings.clash.dns.invalidAdvanced"),
        );
        setValues(toDraft(dns, hosts));
      } else {
        const [dns, hosts] = buildSettings(
          values,
          t("pages.settings.clash.dns.invalidPolicy"),
        );
        setYaml(dump({ dns, hosts }));
      }
      setAdvanced(!advanced);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  return (
    <BaseDialog
      open={open}
      title={t("pages.settings.clash.dns.title")}
      maxWidth="sm"
      fullWidth
      loading={busy}
      okDisabled={!loaded || busy}
      okBtn={t("common.actions.save")}
      cancelBtn={t("common.actions.cancel")}
      onClose={close}
      onCancel={close}
      onOk={save}>
      <Stack spacing={2} sx={{ py: 1 }}>
        <Alert severity="info">{t("pages.settings.clash.dns.scope")}</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <Box
          component="fieldset"
          disabled={busy || !loaded}
          sx={{ border: 0, p: 0, m: 0 }}>
          <Button onClick={switchMode} disabled={busy || !loaded}>
            {t(
              advanced
                ? "pages.settings.clash.dns.formMode"
                : "pages.settings.clash.dns.advancedMode",
            )}
          </Button>
          {advanced ? (
            <TextField
              fullWidth
              multiline
              minRows={16}
              maxRows={28}
              label={t("pages.settings.clash.dns.advancedMode")}
              helperText={t("pages.settings.clash.dns.advancedHint")}
              value={yaml}
              onChange={(event) => setYaml(event.target.value)}
              disabled={busy || !loaded}
              slotProps={{ input: { sx: { fontFamily: "monospace" } } }}
            />
          ) : (
            <Stack spacing={2}>
              {(
                [
                  "use-hosts",
                  "use-system-hosts",
                  "enable",
                  "ipv6",
                  "respect-rules",
                  "prefer-h3",
                  "direct-nameserver-follow-policy",
                ] as const
              ).map((field) => (
                <FormControl fullWidth size="small" key={field}>
                  <InputLabel id={`dns-${field}`}>
                    {t(`pages.settings.clash.dns.${field}`)}
                  </InputLabel>
                  <Select
                    labelId={`dns-${field}`}
                    label={t(`pages.settings.clash.dns.${field}`)}
                    value={values[field]}
                    disabled={busy || !loaded}
                    onChange={(event) =>
                      setValues((old) => ({
                        ...old,
                        [field]: event.target.value as Choice,
                      }))
                    }>
                    <MenuItem value="inherit">
                      {t("pages.settings.clash.dns.inherit")}
                    </MenuItem>
                    <MenuItem value="true">
                      {t("pages.settings.clash.dns.enabled")}
                    </MenuItem>
                    <MenuItem value="false">
                      {t("pages.settings.clash.dns.disabled")}
                    </MenuItem>
                  </Select>
                </FormControl>
              ))}
              <TextField
                size="small"
                label={t("pages.settings.clash.dns.listen")}
                value={values.listen}
                placeholder={
                  typeof effective.listen === "string"
                    ? effective.listen
                    : ":53"
                }
                helperText={t("pages.settings.clash.dns.emptyInherits")}
                autoComplete="off"
                disabled={busy || !loaded}
                onChange={(event) =>
                  setValues((old) => ({ ...old, listen: event.target.value }))
                }
              />
              <FormControl fullWidth size="small">
                <InputLabel id="dns-mode">
                  {t("pages.settings.clash.dns.mode")}
                </InputLabel>
                <Select
                  labelId="dns-mode"
                  label={t("pages.settings.clash.dns.mode")}
                  value={values.mode}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      mode: event.target.value as DnsDraft["mode"],
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="fake-ip">Fake-IP</MenuItem>
                  <MenuItem value="redir-host">Redir-Host</MenuItem>
                </Select>
              </FormControl>
              {(["range", "range6"] as const).map((field) => (
                <TextField
                  key={field}
                  size="small"
                  label={t(`pages.settings.clash.dns.${field}`)}
                  value={values[field]}
                  placeholder={
                    field === "range" ? "198.18.0.1/16" : "fdfe:dcba:9876::1/64"
                  }
                  helperText={t("pages.settings.clash.dns.emptyInherits")}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      [field]: event.target.value,
                    }))
                  }
                />
              ))}
              <FormControl fullWidth size="small">
                <InputLabel id="dns-filter-mode">
                  {t("pages.settings.clash.dns.filterMode")}
                </InputLabel>
                <Select
                  labelId="dns-filter-mode"
                  label={t("pages.settings.clash.dns.filterMode")}
                  value={values.filterMode}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      filterMode: event.target.value as DnsDraft["filterMode"],
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="blacklist">
                    {t("pages.settings.clash.dns.blacklist")}
                  </MenuItem>
                  <MenuItem value="whitelist">
                    {t("pages.settings.clash.dns.whitelist")}
                  </MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel id="dns-filter-source">
                  {t("pages.settings.clash.dns.filter")}
                </InputLabel>
                <Select
                  labelId="dns-filter-source"
                  label={t("pages.settings.clash.dns.filter")}
                  value={values.filterOverride ? "override" : "inherit"}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      filterOverride: event.target.value === "override",
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="override">
                    {t("pages.settings.clash.dns.overrideFilter")}
                  </MenuItem>
                </Select>
              </FormControl>
              {values.filterOverride && (
                <TextField
                  multiline
                  minRows={3}
                  size="small"
                  label={t("pages.settings.clash.dns.filter")}
                  value={values.filter}
                  helperText={t("pages.settings.clash.dns.filterHint")}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({ ...old, filter: event.target.value }))
                  }
                />
              )}
              {serverFields.map((key) => (
                <Stack spacing={1} key={key}>
                  <FormControl fullWidth size="small">
                    <InputLabel id={`dns-${key}`}>
                      {t(`pages.settings.clash.dns.${key}`)}
                    </InputLabel>
                    <Select
                      labelId={`dns-${key}`}
                      label={t(`pages.settings.clash.dns.${key}`)}
                      disabled={busy || !loaded}
                      value={
                        values.servers[key].override ? "override" : "inherit"
                      }
                      onChange={(event) =>
                        setValues((old) => ({
                          ...old,
                          servers: {
                            ...old.servers,
                            [key]: {
                              ...old.servers[key],
                              override: event.target.value === "override",
                            },
                          },
                        }))
                      }>
                      <MenuItem value="inherit">
                        {t("pages.settings.clash.dns.inherit")}
                      </MenuItem>
                      <MenuItem value="override">
                        {t("pages.settings.clash.dns.overrideServers")}
                      </MenuItem>
                    </Select>
                  </FormControl>
                  {values.servers[key].override && (
                    <TextField
                      multiline
                      minRows={2}
                      size="small"
                      label={t(`pages.settings.clash.dns.${key}`)}
                      value={values.servers[key].text}
                      helperText={t("pages.settings.clash.dns.serverHint")}
                      disabled={busy || !loaded}
                      onChange={(event) =>
                        setValues((old) => ({
                          ...old,
                          servers: {
                            ...old.servers,
                            [key]: {
                              ...old.servers[key],
                              text: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  )}
                </Stack>
              ))}
              <FormControl fullWidth size="small">
                <InputLabel id="dns-policy-source">
                  {t("pages.settings.clash.dns.policy")}
                </InputLabel>
                <Select
                  labelId="dns-policy-source"
                  label={t("pages.settings.clash.dns.policy")}
                  value={values.policyOverride ? "override" : "inherit"}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      policyOverride: event.target.value === "override",
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="override">
                    {t("pages.settings.clash.dns.overridePolicy")}
                  </MenuItem>
                </Select>
              </FormControl>
              {values.policyOverride && (
                <TextField
                  multiline
                  minRows={4}
                  size="small"
                  label={t("pages.settings.clash.dns.policy")}
                  value={values.policy}
                  helperText={t("pages.settings.clash.dns.policyHint")}
                  disabled={busy || !loaded}
                  placeholder={
                    "'+.example.com':\n  - https://example.com/dns-query"
                  }
                  onChange={(event) =>
                    setValues((old) => ({ ...old, policy: event.target.value }))
                  }
                />
              )}
              <FormControl fullWidth size="small">
                <InputLabel id="dns-fallback-source">
                  {t("pages.settings.clash.dns.fallbackFilter")}
                </InputLabel>
                <Select
                  labelId="dns-fallback-source"
                  label={t("pages.settings.clash.dns.fallbackFilter")}
                  value={values.fallbackOverride ? "override" : "inherit"}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      fallbackOverride: event.target.value === "override",
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="override">
                    {t("pages.settings.clash.dns.overridePolicy")}
                  </MenuItem>
                </Select>
              </FormControl>
              {values.fallbackOverride && (
                <TextField
                  multiline
                  minRows={5}
                  size="small"
                  label={t("pages.settings.clash.dns.fallbackFilter")}
                  value={values.fallback}
                  helperText={t("pages.settings.clash.dns.fallbackHint")}
                  disabled={busy || !loaded}
                  placeholder={
                    'geoip: false\ngeoip-code: CN\nipcidr: [240.0.0.0/4]\ndomain: ["+.example.com"]'
                  }
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      fallback: event.target.value,
                    }))
                  }
                />
              )}
              <FormControl fullWidth size="small">
                <InputLabel id="dns-hosts-source">
                  {t("pages.settings.clash.dns.hosts")}
                </InputLabel>
                <Select
                  labelId="dns-hosts-source"
                  label={t("pages.settings.clash.dns.hosts")}
                  value={values.hostsOverride ? "override" : "inherit"}
                  disabled={busy || !loaded}
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      hostsOverride: event.target.value === "override",
                    }))
                  }>
                  <MenuItem value="inherit">
                    {t("pages.settings.clash.dns.inherit")}
                  </MenuItem>
                  <MenuItem value="override">
                    {t("pages.settings.clash.dns.overridePolicy")}
                  </MenuItem>
                </Select>
              </FormControl>
              {values.hostsOverride && (
                <TextField
                  multiline
                  minRows={4}
                  size="small"
                  label={t("pages.settings.clash.dns.hosts")}
                  value={values.hosts}
                  helperText={t("pages.settings.clash.dns.hostsHint")}
                  disabled={busy || !loaded}
                  placeholder={'example.com: [127.0.0.1, "::1"]'}
                  onChange={(event) =>
                    setValues((old) => ({ ...old, hosts: event.target.value }))
                  }
                />
              )}
            </Stack>
          )}
        </Box>
        <Alert severity="warning">
          {t("pages.settings.clash.dns.tunNote")}
        </Alert>
      </Stack>
    </BaseDialog>
  );
});

export default DnsViewer;
