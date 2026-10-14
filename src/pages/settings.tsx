import GitHub from "@mui/icons-material/GitHub";
import { Grid, IconButton, Paper } from "@mui/material";
import { useLockFn } from "ahooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BasePage } from "@/components/base";
import { useNotice } from "@/components/base/notifies";
import { ClashInfoCard } from "@/components/home/clash-info-card";
import { SystemInfoCard } from "@/components/home/system-info-card";
import SettingAppearance from "@/components/setting/setting-appearance";
import SettingDirectories from "@/components/setting/setting-directories";
import SettingSystem from "@/components/setting/setting-system";
import SettingVerge from "@/components/setting/setting-verge";
import { openWebUrl } from "@/services/cmds";
import { getErrorMessage } from "@/utils";

const SettingPage = () => {
  const { t } = useTranslation();
  const { notice } = useNotice();

  const onError = useMemo(
    () => (err: unknown) => {
      notice("error", getErrorMessage(err));
    },
    [notice],
  );

  const openGithubRepo = useLockFn(() => {
    return openWebUrl("https://github.com/ClashMorden/ClashMorden");
  });

  return (
    <BasePage
      full
      title={t("pages.settings.title")}
      header={
        <IconButton
          size="medium"
          color="inherit"
          title="@ClashMorden/ClashMorden"
          onClick={openGithubRepo}>
          <GitHub fontSize="inherit" />
        </IconButton>
      }>
      <div className="box-border h-full overflow-y-auto py-2 pr-1 pl-2">
        <Grid container spacing={{ xs: 1.5, lg: 1.5 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <SystemInfoCard />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <ClashInfoCard />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} className="space-y-2.5">
            <Paper elevation={0} className="rounded-xl shadow-sm">
              <SettingSystem onError={onError} />
            </Paper>
            <Paper elevation={0} className="rounded-xl shadow-sm">
              <SettingAppearance onError={onError} />
            </Paper>
            <Paper elevation={0} className="rounded-xl shadow-sm">
              <SettingDirectories />
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} className="space-y-2.5">
            <Paper elevation={0} className="rounded-xl shadow-sm">
              <SettingVerge onError={onError} />
            </Paper>
          </Grid>
        </Grid>
      </div>
    </BasePage>
  );
};

export default SettingPage;
