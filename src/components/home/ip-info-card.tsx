import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { Box } from "@mui/material";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as ipaddr from "ipaddr.js";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPublicIpInfo, IP_INFO_API, randomPublicIp, type IpInfo } from "@/services/api";
import { swrKeys, useSWR } from "@/services/swr";

import { CardLegend } from "./card-legend";
import { EnhancedCard } from "./enhanced-card";
import { OverviewIcon, OverviewPick } from "./overview-controls";

const IP_REFRESH_SECONDS = 300;
const COUNTDOWN_TICK_INTERVAL = 5_000;
const PRIMARY_STORAGE_KEY = "clash-verge-ip-check-primary";
const SECONDARY_STORAGE_KEY = "clash-verge-ip-check-secondary";

const API_OPTIONS = Object.values(IP_INFO_API);

// 掩码：v4 全掩，v6 保留前两段（照抄 zashboard maskIP）
const maskIP = (value: string) => {
  if (!ipaddr.isValid(value)) return "***.***.***.***";
  const address = ipaddr.parse(value);
  if (address.kind() === "ipv4") return "***.***.***.***";
  const parts = address.toNormalizedString().split(":");
  return `${parts[0]}:${parts[1]}:****:****`;
};

const distinct = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

// 展示标签：ipip 用 country/region/city/org 去重拼接，其余用 country/org
const displayLabel = (info: IpInfo, api: IP_INFO_API) => {
  if (api === IP_INFO_API.IPIP) {
    return distinct([
      info.country,
      info.region,
      info.city,
      info.organization,
    ]).join(" ");
  }
  return distinct([info.country, info.organization]).join(" ") || info.ip;
};

// zashboard select-ghost select-xs：小号透明下拉
const ServiceBlock = memo(
  ({
    service,
    color,
    info,
    error,
    isLoading,
    showIp,
    t,
    control,
  }: {
    service: IP_INFO_API;
    color: string;
    info: (IpInfo & { lastFetchTs?: number }) | undefined;
    error: unknown;
    isLoading: boolean;
    showIp: boolean;
    t: (key: string) => string;
    control: React.ReactNode;
  }) => {
    const main = (() => {
      if (isLoading) return t("pages.home.components.ipCheck.status.getting");
      if (error || !info)
        return t("pages.home.components.ipCheck.status.failed");
      return displayLabel(info, service);
    })();
    const ipPart = info ? (showIp ? info.ip : maskIP(info.ip)) : null;

    return (
      <div className="ds-network-row">
        <i style={{ background: color }} />
        <div>
          <strong title={main}>{main}</strong>
          <small>{ipPart ?? "—"}</small>
        </div>
        {control}
      </div>
    );
  },
);
ServiceBlock.displayName = "ServiceBlock";

// 卡片进入视口后开始倒计时自动刷新（一次性门闩，不重置）
const useHasIntersected = (ref: React.RefObject<HTMLElement | null>) => {
  const [hasIntersected, setHasIntersected] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || hasIntersected) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, hasIntersected]);
  return hasIntersected;
};

// 网络信息卡：双槽位 IP 检测（照抄 zashboard IPCheck），每个槽位可选服务
export const IpInfoCard = () => {
  const { t } = useTranslation();
  const [showIp, setShowIp] = useState(false);
  const appWindow = useMemo(() => getCurrentWebviewWindow(), []);

  const [primaryApi, setPrimaryApi] = useState<IP_INFO_API>(
    () =>
      (localStorage.getItem(PRIMARY_STORAGE_KEY) as IP_INFO_API) ||
      IP_INFO_API.IPIP,
  );
  const [secondaryApi, setSecondaryApi] = useState<IP_INFO_API>(
    () =>
      (localStorage.getItem(SECONDARY_STORAGE_KEY) as IP_INFO_API) ||
      IP_INFO_API.IPSB,
  );

  const containerRef = useRef<HTMLElement>(null);
  const hasIntersected = useHasIntersected(containerRef);

  const primary = useSWR(
    [swrKeys.ipInfoPrimary, primaryApi, showIp] as const,
    ([, api, visible]) => getPublicIpInfo(api, visible ? undefined : randomPublicIp()),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      keepPreviousData: true,
    },
  );
  const secondary = useSWR(
    [swrKeys.ipInfoSecondary, secondaryApi, showIp] as const,
    ([, api, visible]) => getPublicIpInfo(api, visible ? undefined : randomPublicIp()),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      keepPreviousData: true,
    },
  );

  const [countdown, setCountdown] = useState<number>(IP_REFRESH_SECONDS);

  // 最新数据放 ref 供倒计时定时器读取
  const dataRef = useRef({ primary: primary.data, secondary: secondary.data });
  dataRef.current = { primary: primary.data, secondary: secondary.data };

  useEffect(() => {
    if (!hasIntersected) return;

    const timer = window.setInterval(() => {
      const timestamps = [
        dataRef.current.primary?.lastFetchTs,
        dataRef.current.secondary?.lastFetchTs,
      ].filter((v): v is number => typeof v === "number");
      const earliest = timestamps.length ? Math.min(...timestamps) : Date.now();

      const remaining =
        IP_REFRESH_SECONDS - Math.floor((Date.now() - earliest) / 1000);

      if (remaining <= 0) {
        const doRefresh = async () => {
          if (navigator.onLine && (await appWindow.isVisible())) {
            await Promise.all([primary.mutate(), secondary.mutate()]);
            setCountdown(IP_REFRESH_SECONDS);
          }
        };
        void doRefresh();
      } else {
        setCountdown(remaining);
      }
    }, COUNTDOWN_TICK_INTERVAL);

    return () => clearInterval(timer);
  }, [hasIntersected, appWindow, primary.mutate, secondary.mutate]);

  const refreshAll = () => {
    void primary.mutate();
    void secondary.mutate();
  };

  const changeApi = (slot: "primary" | "secondary", api: IP_INFO_API) => {
    if (slot === "primary") {
      setPrimaryApi(api);
      localStorage.setItem(PRIMARY_STORAGE_KEY, api);
    } else {
      setSecondaryApi(api);
      localStorage.setItem(SECONDARY_STORAGE_KEY, api);
    }
  };

  const renderBlock = (
    slot: "primary" | "secondary",
    api: IP_INFO_API,
    swr: typeof primary,
  ) => (
    <ServiceBlock
      service={api}
      color={slot === "primary" ? "#7295cf" : "#d09a61"}
      info={swr.data}
      error={swr.error}
      isLoading={swr.isLoading}
      showIp={showIp}
      t={t}
      control={
        <OverviewPick
          label={`${t("pages.home.components.ipCheck.serviceLabel")} ${slot === "primary" ? 1 : 2}`}
          value={api}
          options={API_OPTIONS.map((option) => ({
            value: option,
            label: option,
          }))}
          onChange={(value) => changeApi(slot, value as IP_INFO_API)}
        />
      }
    />
  );

  return (
    <Box className="overview-design" sx={{ height: "100%" }}>
      <EnhancedCard
        iconKind="globe"
        title={t("pages.home.components.ipCheck.title")}
        icon={<LocationOnOutlinedIcon />}
        iconColor="info"
        ref={containerRef}
        action={
          <Box className="ds-tools">
            <CardLegend
              items={[
                { key: "primary", label: primaryApi, color: "#7295cf" },
                { key: "secondary", label: secondaryApi, color: "#d09a61" },
              ]}
            />
            <OverviewIcon
              label={
                showIp
                  ? t("pages.home.components.ipCheck.labels.hideIp")
                  : t("pages.home.components.ipCheck.labels.showIp")
              }
              onClick={() => setShowIp((prev) => !prev)}>
              {showIp ? <EyeOff /> : <Eye />}
            </OverviewIcon>
            <OverviewIcon
              label={`${t("common.actions.refresh")} · ${countdown}s`}
              onClick={refreshAll}>
              <RefreshCw />
            </OverviewIcon>
          </Box>
        }>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {renderBlock("primary", primaryApi, primary)}
          {renderBlock("secondary", secondaryApi, secondary)}
        </Box>
      </EnhancedCard>
    </Box>
  );
};
