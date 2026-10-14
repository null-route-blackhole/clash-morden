import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { Box, Button, ButtonGroup, IconButton } from "@mui/material";
import { useLockFn, useMemoizedFn } from "ahooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { closeAllConnections } from "tauri-plugin-mihomo-api";

import { BasePage } from "@/components/base";
import { ProviderButton } from "@/components/proxy/provider-button";
import { ProxyGroups } from "@/components/proxy/proxy-groups";
import { useClashInfo } from "@/hooks/use-clash";
import { useVergeStore } from "@/stores";

const modeList = ["rule", "global", "direct"];

const ProxyPage = () => {
  const { t } = useTranslation();
  const { clashInfo, patchInfo, mutateInfo } = useClashInfo();
  const autoCloseConnection = useVergeStore(
    (s) => s.verge.auto_close_connection ?? true,
  );
  const enableGroupJump = useVergeStore(
    (s) => s.verge.enable_group_jump ?? true,
  );
  const patchVerge = useVergeStore((s) => s.patchVerge);
  const [showHiddenGroups, setShowHiddenGroups] = useState(false);

  const curMode = clashInfo?.mode?.toLowerCase() ?? "rule";

  const onChangeMode = useMemoizedFn(
    useLockFn(async (mode: string) => {
      await patchInfo({ mode });
      mutateInfo();
      // 断开连接
      if (mode !== curMode && autoCloseConnection) {
        closeAllConnections();
      }
    }),
  );

  useEffect(() => {
    if (curMode && !modeList.includes(curMode)) {
      onChangeMode("rule");
    }
  }, [curMode, onChangeMode]);

  return (
    <BasePage
      full
      title={t("pages.proxies.groups")}
      header={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}>
          <ProviderButton key={"provider"} />

          <ButtonGroup size="small">
            {modeList.map((mode) => (
              <Button
                key={mode}
                variant={mode === curMode ? "contained" : "outlined"}
                onClick={() => onChangeMode(mode)}
                sx={{ textTransform: "capitalize" }}>
                {t(`pages.proxies.modes.${mode}`)}
              </Button>
            ))}
          </ButtonGroup>

          <IconButton
            size="small"
            color={enableGroupJump ? "primary" : "inherit"}
            title={t("pages.proxies.actions.groupJump")}
            onClick={() => patchVerge({ enable_group_jump: !enableGroupJump })}>
            <AccountTreeRounded />
          </IconButton>

          <IconButton
            size="small"
            color={showHiddenGroups ? "primary" : "inherit"}
            title={t("pages.proxies.actions.showHiddenGroups")}
            onClick={() => setShowHiddenGroups((visible) => !visible)}>
            {showHiddenGroups ? (
              <VisibilityRounded />
            ) : (
              <VisibilityOffRounded />
            )}
          </IconButton>
        </Box>
      }>
      <ProxyGroups mode={curMode} showHiddenGroups={showHiddenGroups} />
    </BasePage>
  );
};

export default ProxyPage;
