import { Box } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useLockFn } from "ahooks";
import { Copy, RefreshCw, Server, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { closeAllConnections } from "tauri-plugin-mihomo-api";

import { useNotice } from "@/components/base/notifies";
import { useMemoryData } from "@/hooks/use-memory-data";
import { mutate, swrKeys } from "@/services/swr";
import { useProfilesStore } from "@/stores";
import { getErrorMessage } from "@/utils";
import parseTraffic from "@/utils/parse-traffic";

import { EnhancedCard } from "./enhanced-card";
import { OverviewIcon, OverviewPick } from "./overview-controls";

export const HomeProfileCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notice } = useNotice();
  const current = useProfilesStore((s) => s.currentProfile);
  const profiles = useProfilesStore((s) => s.profileItems);
  const updateProfile = useProfilesStore((s) => s.updateProfile);
  const refreshConfig = useProfilesStore((s) => s.refreshConfig);
  const patchProfiles = useProfilesStore((s) => s.patchConfig);
  const {
    response: { data: memory },
  } = useMemoryData();
  const [updating, setUpdating] = useState(false);
  const used = (current?.extra?.upload ?? 0) + (current?.extra?.download ?? 0);
  const total = current?.extra?.total ?? 0;
  const usage = total
    ? `${parseTraffic(used).join(" ")} / ${parseTraffic(total).join(" ")}`
    : "—";
  const memoryText = parseTraffic(memory?.inuse ?? 0).join(" ");
  const update = useLockFn(async () => {
    if (!current) return;
    setUpdating(true);
    try {
      await updateProfile(current.uid, current.option);
      await refreshConfig();
      void mutate(swrKeys.proxies);
    } catch (err) {
      notice("error", getErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  });
  const switchProfile = useLockFn(async (uid: string) => {
    if (uid === current?.uid) return;
    try {
      await patchProfiles({ current: uid });
    } catch (err) {
      notice("error", getErrorMessage(err));
    }
  });
  const copyEnvironment = async () => {
    try {
      await writeText(
        `${t("pages.home.components.profile.current")}: ${current?.name ?? "—"}\n${t("common.fields.usedTotal")}: ${usage}\n${t("pages.home.components.profile.memory")}: ${memoryText}`,
      );
      notice("success", t("pages.settings.verge.env.copySuccess"));
    } catch (err) {
      notice("error", getErrorMessage(err));
    }
  };
  return (
    <Box className="overview-design" sx={{ height: "100%" }}>
      <EnhancedCard
        iconKind="server"
        title={t("pages.home.components.profile.title")}
        icon={<Server />}
        action={
          <OverviewIcon
            label={t("common.actions.refresh")}
            disabled={!current || updating}
            onClick={update}>
            <RefreshCw className={updating ? "animate-spin" : undefined} />
          </OverviewIcon>
        }>
        {profiles.length ? (
          <>
            <div className="ds-field">
              <span>{t("pages.home.components.profile.current")}</span>
              <OverviewPick
                label={t("navigation.sidebar.profiles")}
                value={current?.uid ?? ""}
                options={[
                  ...(!current ? [{ value: "", label: "—" }] : []),
                  ...profiles.map((p) => ({
                    value: p.uid,
                    label: p.name ?? p.uid,
                  })),
                ]}
                onChange={switchProfile}
              />
            </div>
            <div className="ds-field">
              <span>{t("common.fields.usedTotal")}</span>
              <strong>{usage}</strong>
            </div>
            <div className="ds-bar">
              <i
                style={{
                  width: `${total ? Math.min(100, (used / total) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="ds-field">
              <span>{t("pages.home.components.profile.memory")}</span>
              <strong>{memoryText}</strong>
              <OverviewIcon
                label={t("pages.home.components.profile.copyEnvironment")}
                onClick={copyEnvironment}>
                <Copy />
              </OverviewIcon>
            </div>
            <div className="ds-tools">
              <button
                type="button"
                className="ds-button"
                onClick={() => void navigate({ to: "/profiles" })}>
                <Settings2 />
                {t("pages.home.components.profile.viewConfig")}
              </button>
              {updating && (
                <button type="button" className="ds-button" disabled>
                  {t("pages.home.components.profile.updating")}
                </button>
              )}
              <button
                type="button"
                className="ds-button ds-danger"
                onClick={() =>
                  void closeAllConnections().catch((err) =>
                    notice("error", getErrorMessage(err)),
                  )
                }>
                {t("pages.home.components.profile.disconnect")}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="ds-button"
            onClick={() => void navigate({ to: "/profiles" })}>
            {t("pages.home.components.profile.clickToImport")}
          </button>
        )}
      </EnhancedCard>
    </Box>
  );
};
