import { useTranslation } from "react-i18next";

import { openAppDir, openCoreDir, openLogsDir } from "@/services/cmds";

import { SettingItem, SettingList } from "./mods/setting-comp";

export default function SettingDirectories() {
  const { t } = useTranslation();
  return (
    <SettingList title={t("pages.settings.directoriesTitle")}>
      <SettingItem
        openMoreSettings
        onClick={openAppDir}
        label={t("pages.settings.verge.actions.openAppDir")}
      />
      <SettingItem
        openMoreSettings
        onClick={openCoreDir}
        label={t("pages.settings.verge.actions.openCoreDir")}
      />
      <SettingItem
        openMoreSettings
        onClick={openLogsDir}
        label={t("pages.settings.verge.actions.openLogsDir")}
      />
    </SettingList>
  );
}
