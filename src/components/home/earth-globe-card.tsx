import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import * as ipaddr from "ipaddr.js";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { COUNTRY_CENTROIDS } from "@/assets/geo/country-centroids";
import { LockOpenRounded as LockOpenRoundedIcon } from "@/components/base/interface-icons";
import { LockRounded as LockRoundedIcon } from "@/components/base/interface-icons";
import { PauseRounded as PauseRoundedIcon } from "@/components/base/interface-icons";
import { PlaceRounded as PlaceRoundedIcon } from "@/components/base/interface-icons";
import { PlayArrowRounded as PlayArrowRoundedIcon } from "@/components/base/interface-icons";
import { useConnectionData } from "@/hooks/use-connection-data";
import {
  getPublicIpInfo,
  IP_INFO_API,
  type IpInfo,
  randomPublicIp,
} from "@/services/api";
import { writeAppDiagnostic } from "@/services/cmds";
import { lookupCountryCodes } from "@/services/geoip";
import { resolveMapHost } from "@/services/map-dns";
import { swrKeys, useSWR } from "@/services/swr";
import parseTraffic from "@/utils/parse-traffic";

import { CardLegend } from "./card-legend";
import type { EarthRenderer } from "./earth/earth-renderer";
import { ENDPOINT_PALETTE } from "./earth/palette";
import type { EarthProjection } from "./earth/projection";
import type { EarthVisualMode } from "./earth/renderer-types";
import { buildCentroidRoutes, buildEarthRoutes } from "./earth/routes";
import type {
  EarthEndpointInfo,
  EarthLocation,
  EarthLocationHint,
  EarthRoute,
  GeoDatabaseError,
  GeoDatabaseStatus,
  GeoWorkerRequest,
  GeoWorkerResponse,
} from "./earth/types";
import { DBIP_COMPRESSED_BYTES } from "./earth/types";
import { EnhancedCard } from "./enhanced-card";
import { OverviewIcon, OverviewSegment } from "./overview-controls";

const INIT_DELAY = 400;
const STATUS_STORAGE_KEY = "clashmorden-geoip-status";
const INIT_IDLE_TIMEOUT = 1000;
const ROUTE_REFRESH_DEBOUNCE = 150;

const isValidIP = (value: string) => Boolean(value && ipaddr.isValid(value));

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
};

// 全球连接地球卡：完整移植 zashboard EarthGlobeCard（3D WebGPU + 2D 平面模式，
// GeoIP 数据库授权后按需下载，无库时用连接自带国家码 + 中心点回退画弧线）
export const EarthGlobeCard = () => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();
  const connections = connectionData.activeConnections;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const [showOrigin, setShowOrigin] = useState(
    () => localStorage.getItem("earth-show-origin-v1") !== "false",
  );

  // 链路地图使用 IPIP.net 获取本机出口 IP。IPIP 直连更适合国内用户，
  // 避免通过代理出口探测到错误的位置；城市坐标仍由本地 GeoIP 数据库解析。
  const ipsb = useSWR(
    [swrKeys.ipInfoIpip, showOrigin] as const,
    ([, visible]) =>
      getPublicIpInfo(IP_INFO_API.IPIP, visible ? undefined : randomPublicIp()),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      keepPreviousData: true,
    },
  );
  useEffect(() => {
    localStorage.setItem("earth-show-origin-v1", String(showOrigin));
    if (originStatus !== "loading") {
      void loadOrigin(true);
    }
  }, [showOrigin]);

  const [projection, setProjection] = useState<EarthProjection>("3d");
  const previousProjectionRef = useRef(projection);
  const visualMode: EarthVisualMode = "space";
  const [rotationPaused, setRotationPaused] = useState(false);
  const [showCityLabels, setShowCityLabels] = useState(true);
  const [zoomLocked, setZoomLocked] = useState(true);
  const zoomLockedRef = useRef(zoomLocked);
  zoomLockedRef.current = zoomLocked;

  // 上次会话的数据库终态（ready/idle/error）持久化，避免每次进首页闪「检测中」
  const [databaseStatus, setDatabaseStatus] = useState<GeoDatabaseStatus>(
    () =>
      (localStorage.getItem(STATUS_STORAGE_KEY) as GeoDatabaseStatus | null) ??
      "checking",
  );
  const [databaseError, setDatabaseError] = useState<
    GeoDatabaseError | undefined
  >();
  const [recoveredCorruptCache, setRecoveredCorruptCache] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState(
    DBIP_COMPRESSED_BYTES,
  );

  const [originIP, setOriginIP] = useState("");
  const [originStatus, setOriginStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [routeCount, setRouteCount] = useState(0);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [rendererError, setRendererError] = useState("");
  const [rendererErrorDetail, setRendererErrorDetail] = useState("");

  const [hoveredEndpoint, setHoveredEndpoint] =
    useState<EarthEndpointInfo | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // 2D Leaflet 地图数据（与 3D 渲染器共用同一份路由计算结果）
  const [mapData, setMapData] = useState<{
    routes: EarthRoute[];
    origin: EarthLocation | null;
  }>({ routes: [], origin: null });
  useEffect(() => {
    if (
      !showOrigin &&
      mapData.routes.length > 0 &&
      !originAPIInfoRef.current?.city
    ) {
      void loadOrigin(true);
    }
  }, [mapData.routes.length, showOrigin]);

  const reducedMotion = useReducedMotion();
  const colorScheme = theme.palette.mode === "dark" ? "dark" : "light";

  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<EarthRenderer | null>(null);

  const locationCache = useRef(new Map<string, EarthLocation | null>());
  const lookupRequests = useRef(
    new Map<
      number,
      (locations: Record<string, EarthLocation | null>) => void
    >(),
  );
  const lookupIDRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRunningRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const disposedRef = useRef(false);
  const originRequestIDRef = useRef(0);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initIdleHandleRef = useRef<number | null>(null);
  const initIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initGenerationRef = useRef(0);

  // 最新状态入 ref，供异步回调读取
  const statusRef = useRef({ databaseStatus, originIP, originStatus });
  statusRef.current = { databaseStatus, originIP, originStatus };

  const postWorker = useCallback((message: GeoWorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  const originAPIInfoRef = useRef<IpInfo | null>(null);
  const ipsbInfo: IpInfo | null = originAPIInfoRef.current ?? ipsb.data ?? null;

  const preferredOrigin = useMemo<EarthLocationHint | null>(() => {
    const info = ipsbInfo;
    if (!info || info.latitude == null || info.longitude == null) return null;
    return {
      latitude: info.latitude,
      longitude: info.longitude,
      city: info.city,
      country: info.country,
    };
  }, [ipsbInfo]);

  const lookupLocations = useCallback(
    async (ips: string[], locale: string) => {
      const result: Record<string, EarthLocation | null> = {};
      const missing: string[] = [];

      for (const ip of ips) {
        if (locationCache.current.has(ip)) {
          result[ip] = locationCache.current.get(ip) ?? null;
        } else {
          missing.push(ip);
        }
      }

      if (missing.length > 0) {
        const id = ++lookupIDRef.current;
        const locations = await new Promise<
          Record<string, EarthLocation | null>
        >((resolve) => {
          lookupRequests.current.set(id, resolve);
          postWorker({ type: "lookup", id, ips: missing, locale });
        });

        for (const [ip, location] of Object.entries(locations)) {
          locationCache.current.set(ip, location);
          result[ip] = location;
        }

        while (locationCache.current.size > 8192) {
          const oldest = locationCache.current.keys().next().value;
          if (oldest === undefined) break;
          locationCache.current.delete(oldest);
        }
      }

      return result;
    },
    [postWorker],
  );

  const refreshRoutes = useCallback(async () => {
    if (refreshRunningRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshRunningRef.current = true;

    do {
      refreshQueuedRef.current = false;

      const { databaseStatus: dbStatus, originIP: currentOrigin } =
        statusRef.current;

      if (!isValidIP(currentOrigin)) {
        // Keep the last successful map until a real origin becomes available.
        continue;
      }

      setRoutesLoading(true);
      const snapshot = connectionsRef.current;
      const routeOriginIP = currentOrigin;
      const routeOriginRequestID = originRequestIDRef.current;

      try {
        const locale = i18n.language;
        const routeOriginHint = preferredOrigin;
        void writeAppDiagnostic(
          `[earth-map] route refresh ${JSON.stringify({
            connections: snapshot.length,
            withDestinationIp: snapshot.filter((item) =>
              Boolean(item.metadata.destinationIP),
            ).length,
            withCountry: snapshot.filter((item) =>
              Boolean(item.metadata.destinationGeoIP?.[0]),
            ).length,
            origin: routeOriginIP,
            database: dbStatus,
          })}`,
        ).catch(console.warn);
        let result: {
          routes: Awaited<ReturnType<typeof buildEarthRoutes>>["routes"];
          origin: EarthLocation | null;
        };

        const resolved = await Promise.all(
          snapshot.map(async (connection) => {
            const metadata = connection.metadata;
            const host = metadata.host || metadata.sniffHost;
            const ip =
              metadata.destinationIP ||
              (host ? await resolveMapHost(host) : null);
            return {
              ...connection,
              metadata: { ...metadata, destinationIP: ip ?? "" },
            };
          }),
        );
        const codes = await lookupCountryCodes([
          ...new Set(
            resolved.map((item) => item.metadata.destinationIP).filter(Boolean),
          ),
        ]);
        const located = resolved.map((connection) => ({
          ...connection,
          metadata: {
            ...connection.metadata,
            destinationGeoIP: connection.metadata.destinationGeoIP?.length
              ? connection.metadata.destinationGeoIP
              : COUNTRY_CENTROIDS[codes[connection.metadata.destinationIP]]
                ? [codes[connection.metadata.destinationIP]]
                : [],
          },
        }));
        void writeAppDiagnostic(
          `[earth-map] DNS enrichment ${JSON.stringify({
            connections: snapshot.length,
            resolvedTargets: located.filter(
              (item) => item.metadata.destinationIP,
            ).length,
            countryTargets: located.filter(
              (item) => item.metadata.destinationGeoIP.length,
            ).length,
          })}`,
        ).catch(console.warn);
        if (dbStatus === "ready") {
          result = await buildEarthRoutes(
            located,
            routeOriginIP,
            locale,
            lookupLocations,
            routeOriginHint,
            COUNTRY_CENTROIDS,
          );
        } else {
          // 无数据库回退：内核国家码 + 中心点
          result = buildCentroidRoutes(
            located,
            routeOriginIP,
            COUNTRY_CENTROIDS,
            preferredOrigin,
          );
        }

        if (
          !disposedRef.current &&
          routeOriginRequestID === originRequestIDRef.current &&
          routeOriginIP === statusRef.current.originIP
        ) {
          setRouteCount(result.routes.length);
          if (result.origin)
            rendererRef.current?.setInitialLocation(result.origin);
          rendererRef.current?.setRoutes(result.routes);
          setMapData({ routes: result.routes, origin: result.origin });
          void writeAppDiagnostic(
            `[earth-map] route result ${JSON.stringify({
              routes: result.routes.length,
              originLocated: Boolean(result.origin),
            })}`,
          ).catch(console.warn);
        }
      } catch (error) {
        void writeAppDiagnostic(
          `[earth-map] route error ${String(error)}`,
        ).catch(console.warn);
        if (
          !disposedRef.current &&
          routeOriginRequestID === originRequestIDRef.current &&
          routeOriginIP === statusRef.current.originIP
        ) {
          setRouteCount(0);
          rendererRef.current?.setRoutes([]);
          setMapData({ routes: [], origin: null });
        }
      } finally {
        setRoutesLoading(false);
      }
    } while (refreshQueuedRef.current && !disposedRef.current);

    refreshRunningRef.current = false;
  }, [connections, i18n.language, lookupLocations, preferredOrigin]);

  const scheduleRouteRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshRoutes();
    }, ROUTE_REFRESH_DEBOUNCE);
  }, [refreshRoutes]);

  const loadOrigin = useCallback(
    async (force = false) => {
      const requestID = ++originRequestIDRef.current;
      const cached = force ? null : ipsb.data;

      if (!showOrigin) {
        const candidates = mapData.routes
          .map((route) => route.path.at(-1))
          .filter((point) => Boolean(point?.city));
        const city = candidates[Math.floor(Math.random() * candidates.length)];
        if (city) {
          const result = {
            ip: randomPublicIp(),
            country: city.country,
            region: "",
            city: city.city,
            asn: "",
            organization: "",
            latitude: city.latitude,
            longitude: city.longitude,
          } satisfies IpInfo;
          setOriginIP(result.ip);
          originAPIInfoRef.current = result;
          setOriginStatus("ready");
          scheduleRouteRefresh();
          return;
        }
        try {
          const result = await getPublicIpInfo(
            IP_INFO_API.IPSB,
            randomPublicIp(),
          );
          if (requestID !== originRequestIDRef.current || !isValidIP(result.ip))
            return;
          setOriginIP(result.ip);
          originAPIInfoRef.current = result;
          setOriginStatus("ready");
          scheduleRouteRefresh();
        } catch {
          setOriginStatus("error");
        }
        return;
      }

      if (cached && isValidIP(cached.ip)) {
        setOriginIP(cached.ip);
        originAPIInfoRef.current = cached;
        setOriginStatus("ready");
        scheduleRouteRefresh();
        return;
      }

      setOriginStatus("loading");
      // 保留上一次成功的路由，避免某个探测服务短暂超时时整张地图闪空。

      try {
        // Match Zashboard: the globe origin always uses ipip.net. Other
        // providers remain available to the IP information cards.
        const result = await getPublicIpInfo(IP_INFO_API.IPIP);

        if (!isValidIP(result.ip)) throw new Error("Invalid origin IP");
        if (requestID !== originRequestIDRef.current) return;

        setOriginIP(result.ip);
        originAPIInfoRef.current = result;
        setOriginStatus("ready");
        scheduleRouteRefresh();
      } catch {
        if (requestID !== originRequestIDRef.current) return;
        setOriginStatus("error");
        setOriginIP("");
        originAPIInfoRef.current = null;
      }
    },
    [ipsb.data, mapData.routes, scheduleRouteRefresh, showOrigin],
  );

  const handleWorkerMessage = useCallback(
    ({ data }: MessageEvent<GeoWorkerResponse>) => {
      if (data.type === "lookup") {
        lookupRequests.current.get(data.id)?.(data.locations);
        lookupRequests.current.delete(data.id);
        return;
      }

      // 缓存过终态后跳过中间态（checking/loading-cache），后台校验不闪界面
      if (
        (data.status === "checking" || data.status === "loading-cache") &&
        statusRef.current.databaseStatus === "ready"
      ) {
        return;
      }

      setDatabaseStatus(data.status);
      if (data.error) setDatabaseError(data.error);
      if (data.recoveredCorruptCache) setRecoveredCorruptCache(true);
      if (data.received != null) setDownloadedBytes(data.received);
      if (data.total != null) setDownloadTotalBytes(data.total);

      if (
        data.status === "ready" ||
        data.status === "idle" ||
        data.status === "error"
      ) {
        localStorage.setItem(STATUS_STORAGE_KEY, data.status);
      }

      if (data.status === "ready") {
        locationCache.current.clear();
        scheduleRouteRefresh();
      }
      if (data.status !== "ready" && data.status !== "downloading") {
        setRouteCount(0);
        rendererRef.current?.setRoutes([]);
      }
    },
    [scheduleRouteRefresh],
  );

  const initialize = useCallback(async () => {
    if (disposedRef.current) return;
    const generation = initGenerationRef.current;

    if (!workerRef.current) {
      const worker = new Worker(
        new URL("./earth/geoip.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.addEventListener("message", handleWorkerMessage);
      worker.postMessage({ type: "init" } satisfies GeoWorkerRequest);
    }
    void loadOrigin();

    try {
      const { createEarthRenderer } =
        await import("@/components/home/earth/earth-renderer");

      if (!canvasRef.current || disposedRef.current) return;
      const createdRenderer = await createEarthRenderer(canvasRef.current, {
        reducedMotion,
        projection: "3d",
        visualMode,
        colorScheme,
        onEndpointHover: (info, x, y) => {
          setHoveredEndpoint(info);
          if (x != null && y != null) setTooltipPosition({ x, y });
        },
      });

      if (disposedRef.current || generation !== initGenerationRef.current) {
        createdRenderer.dispose();
        return;
      }

      rendererRef.current = createdRenderer;
      createdRenderer.setAutoRotation(!rotationPaused);
      createdRenderer.setCityLabelsVisible(showCityLabels);
      scheduleRouteRefresh();
    } catch (error) {
      console.error("[earth] renderer init failed:", error);
      canvasRef.current?.replaceChildren();
      setRendererError(t("pages.home.components.earth.rendererError"));
      setRendererErrorDetail(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [
    colorScheme,
    handleWorkerMessage,
    loadOrigin,
    projection,
    reducedMotion,
    rotationPaused,
    scheduleRouteRefresh,
    t,
    visualMode,
  ]);

  // 延迟初始化（400ms + idle），StrictMode 幂等
  useEffect(() => {
    initTimerRef.current = setTimeout(() => {
      initTimerRef.current = null;

      if (typeof requestIdleCallback === "function") {
        initIdleHandleRef.current = requestIdleCallback(
          () => {
            initIdleHandleRef.current = null;
            void initialize();
          },
          { timeout: INIT_IDLE_TIMEOUT },
        );
      } else {
        initIdleTimerRef.current = setTimeout(() => {
          initIdleTimerRef.current = null;
          void initialize();
        });
      }
    }, INIT_DELAY);

    return () => {
      disposedRef.current = true;
      initGenerationRef.current++;
      if (initTimerRef.current) clearTimeout(initTimerRef.current);
      if (initIdleTimerRef.current) clearTimeout(initIdleTimerRef.current);
      if (initIdleHandleRef.current !== null)
        cancelIdleCallback(initIdleHandleRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      workerRef.current?.removeEventListener("message", handleWorkerMessage);
      workerRef.current?.terminate();
      workerRef.current = null;
      locationCache.current.clear();
      lookupRequests.current.clear();
      disposedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (previousProjectionRef.current === projection) return;
    previousProjectionRef.current = projection;
    if (projection === "2d") {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      initGenerationRef.current++;
      return;
    }
    if (!rendererRef.current && !disposedRef.current) void initialize();
  }, [projection]);

  // 数据/设置变更 → renderer
  useEffect(() => {
    scheduleRouteRefresh();
  }, [connections, scheduleRouteRefresh]);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setColorScheme(colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    locationCache.current.clear();
    scheduleRouteRefresh();
  }, [i18n.language, scheduleRouteRefresh]);

  const downloadDatabase = () => {
    setDatabaseError(undefined);
    postWorker({ type: "download" });
  };
  const cancelDatabaseDownload = () => postWorker({ type: "cancel" });
  const retry = () => {
    if (databaseStatus === "error") downloadDatabase();
    if (originStatus === "error") void loadOrigin(true);
    if (databaseStatus === "ready" && originStatus === "ready") {
      scheduleRouteRefresh();
    }
  };

  const toggleRotation = () => {
    setRotationPaused((prev) => {
      rendererRef.current?.setAutoRotation(prev);
      return !prev;
    });
  };

  const downloadProgress = Math.min(
    100,
    (downloadedBytes / Math.max(1, downloadTotalBytes)) * 100,
  );
  const [receivedBytes, receivedUnit] = parseTraffic(downloadedBytes);
  const [totalBytes, totalUnit] = parseTraffic(downloadTotalBytes);
  const downloadProgressLabel = downloadTotalBytes
    ? `${receivedBytes}${receivedUnit} / ${totalBytes}${totalUnit}`
    : `${receivedBytes}${receivedUnit}`;

  const isFlatMap = projection === "2d";
  const flatLook = isFlatMap;

  const showRetry =
    databaseStatus === "error" ||
    originStatus === "error" ||
    (databaseStatus === "ready" &&
      originStatus === "ready" &&
      !routesLoading &&
      routeCount === 0 &&
      connections.length > 0);

  const legendItems = [
    {
      color: ENDPOINT_PALETTE.origin,
      label: t("pages.home.components.earth.roleOrigin"),
    },
    {
      color: ENDPOINT_PALETTE.destination,
      label: t("pages.home.components.earth.legendProxied"),
    },
    {
      color: ENDPOINT_PALETTE.direct,
      label: t("pages.home.components.earth.directLabel"),
    },
  ];

  const tooltipStyle = {
    left: `${Math.min(window.innerWidth - 190, tooltipPosition.x + 12)}px`,
    top: `${Math.min(window.innerHeight - 100, tooltipPosition.y + 12)}px`,
  };

  return (
    <EnhancedCard
      iconKind="globe"
      title={t("pages.home.components.earth.title")}
      icon={<LanguageRoundedIcon />}
      iconColor="primary"
      titleAction={
        <CardLegend
          items={legendItems.map((item) => ({ ...item, key: item.label }))}
        />
      }
      action={
        <Box
          className="overview-design ds-tools"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 0.5,
          }}>
          {!isFlatMap && (
            <Tooltip
              title={
                rotationPaused
                  ? t("pages.home.components.earth.resumeRotation")
                  : t("pages.home.components.earth.pauseRotation")
              }>
              <span>
                <OverviewIcon
                  label={t("pages.home.components.earth.pauseRotation")}
                  active={!rotationPaused}
                  onClick={toggleRotation}>
                  {rotationPaused ? (
                    <PlayArrowRoundedIcon fontSize="small" />
                  ) : (
                    <PauseRoundedIcon fontSize="small" />
                  )}
                </OverviewIcon>
              </span>
            </Tooltip>
          )}
          <OverviewSegment
            label={t("pages.home.components.earth.title")}
            options={[
              { value: "3d", label: "3D" },
              { value: "2d", label: "2D" },
            ]}
            value={projection}
            onChange={(value) => setProjection(value as EarthProjection)}
          />
          <Tooltip
            title={
              showCityLabels
                ? t("pages.home.components.earth.hideCityLabels")
                : t("pages.home.components.earth.showCityLabels")
            }>
            <span>
              <OverviewIcon
                label={t("pages.home.components.earth.showCityLabels")}
                active={showCityLabels}
                onClick={() => {
                  const next = !showCityLabels;
                  setShowCityLabels(next);
                  rendererRef.current?.setCityLabelsVisible(next);
                }}>
                <PlaceRoundedIcon fontSize="small" />
              </OverviewIcon>
            </span>
          </Tooltip>
          <Tooltip title={showOrigin ? "隐藏位置" : "显示位置"}>
            <span>
              <OverviewIcon
                label={showOrigin ? "隐藏位置" : "显示位置"}
                onClick={() => setShowOrigin((value) => !value)}>
                {showOrigin ? <EyeOff size={16} /> : <Eye size={16} />}
              </OverviewIcon>
            </span>
          </Tooltip>

          <Tooltip title={zoomLocked ? "解锁缩放" : "锁定缩放"}>
            <OverviewIcon
              label={zoomLocked ? "解锁缩放" : "锁定缩放"}
              active={zoomLocked}
              aria-label={zoomLocked ? "解锁缩放" : "锁定缩放"}
              aria-pressed={zoomLocked}
              onClick={() => {
                const next = !zoomLocked;
                setZoomLocked(next);
              }}>
              {zoomLocked ? (
                <LockRoundedIcon fontSize="small" />
              ) : (
                <LockOpenRoundedIcon fontSize="small" />
              )}
            </OverviewIcon>
          </Tooltip>
        </Box>
      }>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: "95 / 61",
          minHeight: 300,
          overflow: "hidden",
          borderRadius: 1.5,
          bgcolor: flatLook ? alpha(theme.palette.text.primary, 0.03) : "#000",
        }}>
        <div
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            touchAction: "none",
            display: "block",
          }}
        />

        {/* 状态叠加层 */}
        {databaseStatus === "checking" || databaseStatus === "loading-cache" ? (
          <OverlayCentered>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {databaseStatus === "checking"
                ? t("pages.home.components.earth.database.checking")
                : t("pages.home.components.earth.database.loading")}
            </Typography>
          </OverlayCentered>
        ) : databaseStatus === "idle" ? (
          <OverlayCentered>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t("pages.home.components.earth.database.consentTitle")}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textAlign: "center", maxWidth: 360, mb: 1 }}>
              {t("pages.home.components.earth.database.consent", {
                download: "61.7 MB",
                stored: "130.2 MB",
              })}
            </Typography>
            {recoveredCorruptCache && (
              <Typography variant="caption" color="warning.main" sx={{ mb: 1 }}>
                {t("pages.home.components.earth.database.cacheRecovered")}
              </Typography>
            )}
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                variant="contained"
                size="small"
                onClick={downloadDatabase}>
                {t("pages.home.components.earth.database.download")}
              </Button>
              <Button
                size="small"
                onClick={() =>
                  void import("@/services/cmds").then(({ openWebUrl }) =>
                    openWebUrl("https://db-ip.com/db/lite.php"),
                  )
                }>
                {t("pages.home.components.earth.database.learnMore")}
              </Button>
            </Box>
          </OverlayCentered>
        ) : databaseStatus === "downloading" ? (
          <OverlayCentered>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {t("pages.home.components.earth.database.downloading")}
            </Typography>
            <Box sx={{ width: 260 }}>
              <LinearProgress variant="determinate" value={downloadProgress} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              {downloadProgressLabel}
            </Typography>
            <Button
              size="small"
              sx={{ mt: 1 }}
              onClick={cancelDatabaseDownload}>
              {t("common.actions.cancel")}
            </Button>
          </OverlayCentered>
        ) : databaseStatus === "error" ? (
          <OverlayCentered>
            <Typography
              variant="body2"
              color="error.main"
              sx={{ textAlign: "center" }}>
              {t(
                `pages.home.components.earth.database.errors.${databaseError ?? "unknown"}`,
              )}
            </Typography>
            <Button size="small" sx={{ mt: 1 }} onClick={retry}>
              {t("common.actions.retry")}
            </Button>
          </OverlayCentered>
        ) : null}

        {/* 就绪态的提示条 */}
        {databaseStatus === "ready" && originStatus === "error" && (
          <OverlayCentered>
            <Typography variant="body2" color="text.secondary">
              {t("pages.home.components.earth.originError")}
            </Typography>
            <Button size="small" sx={{ mt: 1 }} onClick={retry}>
              {t("common.actions.retry")}
            </Button>
          </OverlayCentered>
        )}
        {showRetry &&
          databaseStatus !== "error" &&
          originStatus !== "error" && (
            <OverlayCentered>
              <Typography variant="body2" color="text.secondary">
                {t("pages.home.components.earth.noLocated")}
              </Typography>
              <Button size="small" sx={{ mt: 1 }} onClick={retry}>
                {t("common.actions.retry")}
              </Button>
            </OverlayCentered>
          )}
        {databaseStatus === "ready" &&
          originStatus === "ready" &&
          !routesLoading &&
          connections.length === 0 &&
          routeCount === 0 && (
            <OverlayCentered>
              <Typography variant="body2" color="text.secondary">
                {t("pages.home.components.earth.noConnections")}
              </Typography>
            </OverlayCentered>
          )}

        {rendererError && (
          <OverlayCentered>
            <Typography variant="body2" color="error.main">
              {rendererError}
            </Typography>
            {rendererErrorDetail && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, maxWidth: 320, textAlign: "center" }}>
                {rendererErrorDetail}
              </Typography>
            )}
          </OverlayCentered>
        )}

        {/* 底部署名（DB-IP 要求保留链接） */}
        <Box
          sx={{
            position: "absolute",
            bottom: 6,
            left: 8,
            display: "flex",
            gap: 1.5,
            pointerEvents: "auto",
          }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ opacity: 0.7, cursor: "pointer" }}
            onClick={() =>
              void import("@/services/cmds").then(({ openWebUrl }) =>
                openWebUrl("https://db-ip.com/db/lite.php"),
              )
            }>
            IP geolocation by DB-IP.com
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ opacity: 0.7 }}>
            Solar System Scope · CC BY 4.0
          </Typography>
        </Box>
      </Box>

      {/* 悬停提示（Teleport → fixed 定位） */}
      {hoveredEndpoint && (
        <Box
          sx={{
            position: "fixed",
            zIndex: 10000,
            pointerEvents: "none",
            p: 1,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.background.paper, 0.95),
            boxShadow: 3,
            maxWidth: 256,
          }}
          style={tooltipStyle}>
          <Typography
            variant="caption"
            sx={{ display: "block", fontWeight: 600 }}>
            {hoveredEndpoint.country || hoveredEndpoint.city}
            {hoveredEndpoint.city && hoveredEndpoint.country
              ? ` · ${hoveredEndpoint.city}`
              : ""}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}>
            {t("pages.home.components.earth.role")}:{" "}
            {hoveredEndpoint.role === "origin"
              ? t("pages.home.components.earth.roleOrigin")
              : t("pages.home.components.earth.roleDestination")}
            {" · "}
            {t("pages.home.components.earth.connectionCount")}:{" "}
            {hoveredEndpoint.connections}
          </Typography>
          {hoveredEndpoint.topHosts.slice(0, 5).map((item) => {
            const [value, unit] = parseTraffic(item.downloaded);
            return (
              <Box
                key={item.host}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 1.5,
                }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                  {item.host}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0 }}>
                  {value}
                  {unit}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </EnhancedCard>
  );
};

const OverlayCentered = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    }}>
    {children}
  </Box>
);
