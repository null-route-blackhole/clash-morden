import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parse, stringify } from "yaml";

import type { KernelField } from "./schema";

export type MapRow = { key: string; value: string };
export const toMapRows = (value: unknown): MapRow[] =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).map(([key, value]) => ({
        key,
        value: stringify(value).trim(),
      }))
    : [];
export const prepareField = (field: KernelField, value: unknown): unknown => {
  if (value === null) return null;
  if (field.type === "number") {
    if (
      value === "" ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < (field.min ?? 0) ||
      Number(value) > (field.max ?? 1_000_000)
    )
      throw new Error(field.path);
    return Number(value);
  }
  if (field.type === "map") {
    const result: Record<string, unknown> = {};
    for (const row of value as MapRow[]) {
      const key = row.key.trim();
      if (!key || Object.hasOwn(result, key) || !row.value.trim())
        throw new Error(field.path);
      Object.defineProperty(result, key, {
        value: parse(row.value),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  if (field.type === "list") {
    const items = (value as (string | number)[]).map((item) =>
      String(item).trim(),
    );
    if (items.some((item) => !item)) throw new Error(field.path);
    if (
      field.path === "tun.exclude-src-port" ||
      field.path === "tun.exclude-dst-port"
    ) {
      if (
        items.some(
          (item) =>
            !/^\d+$/.test(item) || Number(item) < 1 || Number(item) > 65535,
        )
      )
        throw new Error(field.path);
      return items.map(Number);
    }
    return items;
  }
  if (field.type === "text") return String(value).trim() || null;
  return value;
};

export const KernelFieldEditor = ({
  field,
  value,
  interfaces,
  onChange,
  onReset,
  inherited,
  source,
  disabled,
}: {
  field: KernelField;
  value: unknown;
  interfaces: NetInfo[];
  onChange: (value: unknown) => void;
  onReset: () => void;
  inherited: boolean;
  source: "config" | "override" | "edited" | "suggested" | "reset";
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  const label = t(`pages.kernel.fields.${field.path}`);
  const entries = Array.isArray(value) ? value : [];
  const reset = (
    <Tooltip title={t("pages.kernel.inherit")}>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          aria-label={`${label}: ${t("pages.kernel.inherit")}`}
          onClick={onReset}>
          <RestartAltRounded fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
  const updateEntry = (index: number, next: unknown) =>
    onChange(entries.map((entry, i) => (i === index ? next : entry)));
  let input: ReactNode;
  if (field.type === "boolean")
    input = (
      <Switch
        size="small"
        checked={value === true}
        disabled={disabled}
        onChange={(_, checked) => onChange(checked)}
        slotProps={{ input: { "aria-label": label } }}
      />
    );
  else if (field.type === "select" || field.type === "interfaces") {
    const options =
      field.type === "interfaces"
        ? Array.from(
            new Set([
              "",
              ...interfaces.map((i) => i.name),
              String(value ?? ""),
            ]),
          )
        : field.options!;
    input = (
      <TextField
        select
        hiddenLabel
        size="small"
        value={value ?? ""}
        disabled={disabled}
        sx={{ minWidth: 180, maxWidth: "100%" }}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          select: { displayEmpty: true, inputProps: { "aria-label": label } },
        }}>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {field.type === "interfaces"
              ? option || t("pages.kernel.automatic")
              : t(
                  field.path === "app-quic-block"
                    ? `pages.kernel.quic.${option}`
                    : `pages.kernel.options.${option}`,
                )}
          </MenuItem>
        ))}
      </TextField>
    );
  } else if (["list", "map", "auth"].includes(field.type)) {
    input = (
      <Stack spacing={1} sx={{ width: "100%" }}>
        {entries.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            {t("pages.kernel.empty")}
          </Typography>
        )}
        {entries.map((entry, index) => (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center" }}
            key={index}>
            <Typography variant="caption" sx={{ width: 22 }}>
              {index + 1}.
            </Typography>
            {field.type === "map" ? (
              <>
                <TextField
                  size="small"
                  hiddenLabel
                  placeholder="Domain"
                  value={(entry as MapRow).key}
                  disabled={disabled}
                  sx={{ flex: 1, minWidth: 0 }}
                  slotProps={{
                    htmlInput: { "aria-label": `${label} Domain ${index + 1}` },
                  }}
                  onChange={(e) =>
                    updateEntry(index, { ...entry, key: e.target.value })
                  }
                />
                <TextField
                  size="small"
                  hiddenLabel
                  placeholder="IP / Alias / DNS"
                  value={(entry as MapRow).value}
                  disabled={disabled}
                  sx={{ flex: 1.5, minWidth: 0 }}
                  slotProps={{
                    htmlInput: { "aria-label": `${label} Value ${index + 1}` },
                  }}
                  onChange={(e) =>
                    updateEntry(index, { ...entry, value: e.target.value })
                  }
                />
              </>
            ) : field.type === "auth" ? (
              <>
                <TextField
                  size="small"
                  hiddenLabel
                  placeholder={t("pages.kernel.username")}
                  value={String(entry).split(":")[0]}
                  disabled={disabled}
                  sx={{ flex: 1, minWidth: 0 }}
                  slotProps={{
                    htmlInput: {
                      "aria-label": `${label} ${t("pages.kernel.username")} ${index + 1}`,
                    },
                  }}
                  onChange={(e) =>
                    updateEntry(
                      index,
                      `${e.target.value}:${String(entry).split(":").slice(1).join(":")}`,
                    )
                  }
                />
                <TextField
                  size="small"
                  hiddenLabel
                  type="password"
                  placeholder={t("pages.kernel.password")}
                  value={String(entry).split(":").slice(1).join(":")}
                  disabled={disabled}
                  sx={{ flex: 1, minWidth: 0 }}
                  autoComplete="new-password"
                  slotProps={{
                    htmlInput: {
                      "aria-label": `${label} ${t("pages.kernel.password")} ${index + 1}`,
                    },
                  }}
                  onChange={(e) =>
                    updateEntry(
                      index,
                      `${String(entry).split(":")[0]}:${e.target.value}`,
                    )
                  }
                />
              </>
            ) : (
              <TextField
                size="small"
                hiddenLabel
                fullWidth
                value={entry}
                disabled={disabled}
                slotProps={{
                  htmlInput: { "aria-label": `${label} ${index + 1}` },
                }}
                onChange={(e) => updateEntry(index, e.target.value)}
              />
            )}
            <IconButton
              size="small"
              disabled={disabled}
              aria-label={`${t("common.actions.delete")} ${label} ${index + 1}`}
              onClick={() => onChange(entries.filter((_, i) => i !== index))}>
              <DeleteOutlineRounded fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Button
          size="small"
          startIcon={<AddRounded />}
          disabled={disabled}
          sx={{ alignSelf: "flex-start" }}
          onClick={() =>
            onChange([
              ...entries,
              field.type === "map"
                ? { key: "", value: "" }
                : field.type === "auth"
                  ? ":"
                  : "",
            ])
          }>
          {t("common.actions.new")}
        </Button>
        {field.type === "map" && (
          <Typography variant="caption" color="text.secondary">
            {t("pages.kernel.mapHint")}
          </Typography>
        )}
      </Stack>
    );
  } else
    input = (
      <TextField
        size="small"
        hiddenLabel
        value={value ?? ""}
        type={field.type === "number" ? "number" : "text"}
        disabled={disabled}
        sx={{ width: field.type === "number" ? 150 : 300, maxWidth: "100%" }}
        autoComplete="off"
        slotProps={{
          htmlInput: { min: field.min, max: field.max, "aria-label": label },
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  const multiple = ["list", "map", "auth"].includes(field.type);
  return (
    <Box
      sx={{
        py: 1.25,
        "& .MuiInputBase-input, & .MuiSelect-select": {
          color: inherited ? "text.secondary" : "text.primary",
        },
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-child": { border: 0 },
      }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: multiple ? 1 : 0,
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
        }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2">{label}</Typography>
          <Typography
            variant="caption"
            color={inherited ? "text.secondary" : "text.primary"}>
            {t(`pages.kernel.sources.${source}`)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {!multiple && input}
          {reset}
        </Stack>
      </Stack>
      {multiple && input}
    </Box>
  );
};
