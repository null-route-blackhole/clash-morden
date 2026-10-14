import { MenuItem, Select, Switch, TextField } from "@mui/material";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DialogRef } from "@/components/base";
import { useVergeStore } from "@/stores";
import {
  INTERFACE_STYLES,
  type InterfaceStyle,
  useInterfaceStyleStore,
} from "@/stores/interfaceStyleStore";

import { GuardState } from "./mods/guard-state";
import LayoutViewer from "./mods/layout-viewer";
import { SettingItem, SettingList } from "./mods/setting-comp";
import { ThemeModeSwitch } from "./mods/theme-mode-switch";
import ThemeViewer from "./mods/theme-viewer";

interface Props {
  onError?: (err: Error) => void;
}

// 主题设置分类：主题模式 / 主题设置 / 界面设置（从 Verge 设置独立出来）
const SettingAppearance = ({ onError }: Props) => {
  const { t } = useTranslation();
  const themeMode = useVergeStore((s) => s.verge.theme_mode);
  const patchVerge = useVergeStore((s) => s.patchVerge);

  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const colorOpacity = useInterfaceStyleStore((s) => s.colorOpacity);
  const setColorOpacity = useInterfaceStyleStore((s) => s.setColorOpacity);
  const setColorIntensity = useInterfaceStyleStore((s) => s.setColorIntensity);
  const [intensityInput, setIntensityInput] = useState(() =>
    String(colorIntensity),
  );
  const intensityInvalid =
    intensityInput !== "" &&
    (!Number.isFinite(Number(intensityInput)) ||
      Number(intensityInput) < 0 ||
      Number(intensityInput) > 100);
  const appearance = useInterfaceStyleStore((s) => s.appearance);
  const setAppearancePreview = useInterfaceStyleStore((s) => s.setPreview);
  const saveAppearance = useInterfaceStyleStore((s) => s.save);
  const updateAppearance = (value: Partial<typeof appearance>) => {
    setAppearancePreview({ ...appearance, ...value });
    saveAppearance();
  };

  const themeRef = useRef<DialogRef>(null);
  const layoutRef = useRef<DialogRef>(null);

  return (
    <SettingList title={t("pages.settings.appearance.title")}>
      <ThemeViewer ref={themeRef} />
      <LayoutViewer ref={layoutRef} />

      <SettingItem label={t("pages.settings.verge.themeMode.label")}>
        <GuardState
          value={themeMode}
          onCatch={onError}
          onGuard={(e) => patchVerge({ theme_mode: e })}>
          <ThemeModeSwitch />
        </GuardState>
      </SettingItem>

      <SettingItem label={t("pages.settings.verge.theme.interfaceStyle")}>
        <Select
          size="small"
          value={appearance.style}
          inputProps={{
            "aria-label": t("pages.settings.verge.theme.interfaceStyle"),
          }}
          onChange={(event) =>
            updateAppearance({ style: event.target.value as InterfaceStyle })
          }
          sx={{ width: 180 }}>
          {INTERFACE_STYLES.map((style) => (
            <MenuItem key={style} value={style}>
              {t(`pages.settings.verge.theme.interfaceStyles.${style}`)}
            </MenuItem>
          ))}
        </Select>
      </SettingItem>
      <SettingItem label={t("pages.settings.verge.theme.compactMode")}>
        <Switch
          checked={appearance.compact}
          onChange={(_, compact) => updateAppearance({ compact })}
          slotProps={{
            input: {
              "aria-label": t("pages.settings.verge.theme.compactMode"),
            },
          }}
        />
      </SettingItem>

      <SettingItem label={t("pages.settings.verge.theme.colorIntensity")}>
        <TextField
          size="small"
          type="number"
          value={intensityInput}
          error={intensityInvalid}
          helperText={intensityInvalid ? "0–100" : undefined}
          sx={{ width: 110 }}
          slotProps={{
            htmlInput: {
              min: 0,
              max: 100,
              step: 1,
              "aria-label": t("pages.settings.verge.theme.colorIntensity"),
            },
          }}
          onChange={(event) => {
            const value = event.target.value;
            setIntensityInput(value);
            const intensity = Number(value);
            if (
              value !== "" &&
              Number.isFinite(intensity) &&
              intensity >= 0 &&
              intensity <= 100
            )
              setColorIntensity(intensity);
          }}
          onBlur={() => setIntensityInput(String(colorIntensity))}
        />
      </SettingItem>

      <SettingItem label={t("pages.settings.verge.theme.colorOpacity")}>
        <TextField
          size="small"
          type="number"
          value={colorOpacity}
          sx={{ width: 110 }}
          slotProps={{
            htmlInput: {
              min: 0,
              max: 100,
              step: 1,
              "aria-label": t("pages.settings.verge.theme.colorOpacity"),
            },
          }}
          onChange={(event) => setColorOpacity(Number(event.target.value))}
        />
      </SettingItem>

      <SettingItem
        openMoreSettings
        onClick={() => themeRef.current?.open()}
        label={t("pages.settings.verge.theme.title")}
      />

      <SettingItem
        openMoreSettings
        onClick={() => layoutRef.current?.open()}
        label={t("pages.settings.verge.layout.title")}
      />
    </SettingList>
  );
};

export default SettingAppearance;
