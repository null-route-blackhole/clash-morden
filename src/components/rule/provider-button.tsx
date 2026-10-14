import RefreshRounded from "@mui/icons-material/RefreshRounded";
import { Button, Divider, IconButton, Paper, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateRuleProvider } from "tauri-plugin-mihomo-api";

import { BaseDialog } from "@/components/base";
import { useProviderUpdates } from "@/hooks/use-provider-updates";
import { useRulesStateStore } from "@/stores";
import { cn } from "@/utils";

export const ProviderButton = () => {
  const { t } = useTranslation();
  const rules = useRulesStateStore((s) => s.rules);
  const fetchRules = useRulesStateStore((s) => s.fetchRules);
  const loadPayload = useRulesStateStore((s) => s.loadPayload);
  const providers = rules.filter(
    (i) =>
      i.vehicleType === "HTTP" ||
      i.vehicleType === "File" ||
      i.vehicleType === "Inline",
  );

  const names = providers.map((i) => i.payload);
  const hasProvider = names.length > 0;

  const [open, setOpen] = useState(false);
  const { updating, errors, update } = useProviderUpdates(
    updateRuleProvider,
    async () => {
      await fetchRules();
      await loadPayload();
    },
  );

  if (!hasProvider) return null;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        sx={{ textTransform: "capitalize" }}
        onClick={() => setOpen(true)}>
        {t("pages.rules.provider")}
      </Button>

      <BaseDialog
        open={open}
        title={
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center">
              <Typography variant="h6">{t("pages.rules.provider")}</Typography>
              <span className="bg-primary/20 text-primary ml-2 inline-block rounded px-1 text-sm font-bold">
                {providers.length}
              </span>
            </div>
            <Button
              variant="contained"
              size="small"
              disabled={names.some((name) => updating[name])}
              onClick={() => void update(names)}>
              {t("common.actions.updateAll")}
            </Button>
          </div>
        }
        maxWidth="xs"
        fullWidth
        hideOkBtn
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}>
        <div className="flex flex-col gap-2">
          {providers.map((item) => {
            const name = item.payload;
            const time = dayjs(item?.updatedAt);
            return (
              <Paper
                key={name}
                variant="outlined"
                elevation={0}
                className="flex items-center rounded-lg p-2">
                <div className="w-full overflow-hidden">
                  <div className="flex items-center">
                    <p className="text-text-primary text-xl">{name}</p>
                    <span className="bg-primary/20 text-primary ml-2 inline-block rounded px-1 text-xs font-bold">
                      {item?.ruleCount}
                    </span>
                  </div>
                  <span className="border-primary/50 text-primary/80 mr-1 inline-block rounded border px-0.5 text-[10px]">
                    {item?.vehicleType}
                  </span>
                  <span className="border-primary/50 text-primary/80 mr-1 inline-block rounded border px-0.5 text-[10px]">
                    {item?.behavior}
                  </span>
                  <span className="border-primary/50 text-primary/80 mr-1 inline-block rounded border px-0.5 text-[10px]">
                    {t("pages.proxies.updateAt")} {time.fromNow()}
                  </span>
                  {errors[name] && (
                    <Typography
                      role="alert"
                      variant="caption"
                      color="error"
                      sx={{ display: "block", overflowWrap: "anywhere" }}>
                      {errors[name]}
                    </Typography>
                  )}
                </div>
                <Divider orientation="vertical" flexItem />
                <IconButton
                  size="small"
                  color="inherit"
                  title={`${t("common.actions.update")}${t("pages.rules.provider")}`}
                  disabled={updating[name]}
                  onClick={() => void update([name])}>
                  <RefreshRounded
                    className={cn({
                      "animate-spin": updating[name],
                    })}
                  />
                </IconButton>
              </Paper>
            );
          })}
        </div>
      </BaseDialog>
    </>
  );
};
