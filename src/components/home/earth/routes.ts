import ipaddr from "ipaddr.js";

import type { IConnectionsItem } from "@/hooks/use-connection-data";

import type {
  EarthHostTraffic,
  EarthLocation,
  EarthLocationHint,
  EarthRoute,
} from "./types";

type LocatedCoordinates = { latitude: number; longitude: number };

interface RouteCandidate {
  destinationIP: string | null;
  host: string;
  countryCode: string | null;
  upload: number;
  download: number;
  downloaded: number;
  direct: boolean;
}

// 移植 zashboard routes.ts：访问器改为直接读 fork 的 IConnectionsItem 字段，
// 域名连接由地图刷新流程通过 Mihomo DNS API 补齐目标 IP。

const normalizeIP = (value: string) => {
  try {
    return ipaddr.parse(value).toNormalizedString();
  } catch {
    return null;
  }
};

const destinationIP = (rawValue: string) => {
  const value = rawValue.trim();

  if (!value) return null;

  const bareIP = normalizeIP(value);

  if (bareIP) return bareIP;

  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");

    if (closingBracket > 1) return normalizeIP(value.slice(1, closingBracket));
  }

  const lastColon = value.lastIndexOf(":");

  if (lastColon > 0 && /^\d+$/.test(value.slice(lastColon + 1))) {
    return normalizeIP(value.slice(0, lastColon));
  }

  return null;
};

const extractCandidates = (
  connections: readonly IConnectionsItem[],
): RouteCandidate[] => {
  const candidates: RouteCandidate[] = [];

  for (const connection of connections) {
    const destination = destinationIP(connection.metadata.destinationIP);
    const rawHost = (connection.metadata.host || connection.metadata.sniffHost || "")
      .trim()
      .replace(/\.$/, "");

    if (!destination && !rawHost) continue;

    candidates.push({
      destinationIP: destination,
      host: rawHost.toLowerCase(),
      countryCode: connection.metadata.destinationGeoIP?.[0]?.toUpperCase() ?? null,
      upload: Math.max(0, connection.curUpload ?? 0),
      download: Math.max(0, connection.curDownload ?? 0),
      downloaded: Math.max(0, connection.download),
      direct: !(connection.chains?.length) || connection.chains.includes("DIRECT"),
    });
  }

  return candidates;
};

const coordinateKey = ({ latitude, longitude }: EarthLocation) =>
  `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

const mergeTopHosts = (...groups: EarthHostTraffic[][]) =>
  groups
    .flat()
    .sort((left, right) => right.downloaded - left.downloaded)
    .slice(0, 5);

const hasValidCoordinates = (
  location:
    | Pick<EarthLocationHint, "latitude" | "longitude">
    | EarthLocation
    | null,
): location is (EarthLocationHint | EarthLocation) & LocatedCoordinates =>
  location !== null &&
  location.latitude !== null &&
  location.longitude !== null &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude) &&
  location.latitude >= -90 &&
  location.latitude <= 90 &&
  location.longitude >= -180 &&
  location.longitude <= 180;

const resolveOrigin = (
  ip: string,
  local: EarthLocation | null | undefined,
  preferred?: EarthLocationHint | null,
): EarthLocation | null => {
  let latitude: number;
  let longitude: number;

  if (preferred && hasValidCoordinates(preferred)) {
    latitude = preferred.latitude;
    longitude = preferred.longitude;
  } else if (local && hasValidCoordinates(local)) {
    latitude = local.latitude;
    longitude = local.longitude;
  } else {
    return null;
  }

  return {
    ip,
    latitude,
    longitude,
    city: preferred?.city.trim() || local?.city || "",
    country: local?.country || preferred?.country.trim() || "",
  };
};

/** 数据库模式：IP 精确到城市（输入已完成 DNS 补齐，worker 查询坐标） */
export const buildEarthRoutes = async (
  connections: readonly IConnectionsItem[],
  originIP: string,
  locale: string,
  lookup: (ips: string[], locale: string) => Promise<Record<string, EarthLocation | null>>,
  preferredOrigin?: EarthLocationHint | null,
  centroids?: Readonly<Record<string, readonly [number, number]>>,
) => {
  const normalizedOrigin = normalizeIP(originIP);

  if (!normalizedOrigin) return { routes: [] as EarthRoute[], origin: null };

  const candidates = extractCandidates(connections).filter(
    (candidate) => candidate.destinationIP !== null || candidate.countryCode !== null,
  );

  const ips = new Set<string>([normalizedOrigin]);

  for (const candidate of candidates) {
    if (candidate.destinationIP) ips.add(candidate.destinationIP);
  }

  const locations = await lookup([...ips], locale);
  const origin = resolveOrigin(normalizedOrigin, locations[normalizedOrigin], preferredOrigin);

  if (!origin) return { routes: [] as EarthRoute[], origin: null };

  const aggregated = new Map<string, EarthRoute>();

  for (const candidate of candidates) {
    const precise = candidate.destinationIP ? locations[candidate.destinationIP] : null;
    const centroid = candidate.countryCode ? centroids?.[candidate.countryCode] : undefined;
    const destination = precise ?? (centroid
      ? {
          ip: candidate.destinationIP ?? "",
          latitude: centroid[0],
          longitude: centroid[1],
          city: "",
          country: candidate.countryCode ?? "",
        }
      : null);

    if (!destination) continue;

    const path: EarthRoute["path"] = [
      { ...origin, role: "origin" },
      { ...destination, role: "destination" },
    ];
    const key = path.map((point) => `${point.role}:${coordinateKey(point)}`).join(">");
    const existing = aggregated.get(key);

    if (existing) {
      existing.direct &&= candidate.direct;
      existing.connections += 1;
      existing.upload += candidate.upload;
      existing.download += candidate.download;
      existing.topHosts = mergeTopHosts(
        existing.topHosts,
        candidate.host ? [{ host: candidate.host, downloaded: candidate.downloaded }] : [],
      );
    } else {
      aggregated.set(key, {
        key,
        path,
        direct: candidate.direct,
        connections: 1,
        upload: candidate.upload,
        download: candidate.download,
        topHosts: candidate.host
          ? [{ host: candidate.host, downloaded: candidate.downloaded }]
          : [],
      });
    }
  }

  return { routes: [...aggregated.values()], origin };
};

/**
 * 无数据库回退模式：用内核填充的 metadata.destinationGeoIP（ISO 国家码）
 * + 内置国家中心点表画弧线，产出与数据库模式同构的 EarthRoute。
 */
export const buildCentroidRoutes = (
  connections: readonly IConnectionsItem[],
  originIP: string,
  centroids: Readonly<Record<string, readonly [number, number]>>,
  preferredOrigin?: EarthLocationHint | null,
): { routes: EarthRoute[]; origin: EarthLocation | null } => {
  const normalizedOrigin = normalizeIP(originIP);

  if (!normalizedOrigin) return { routes: [], origin: null };

  const origin = resolveOrigin(normalizedOrigin, null, preferredOrigin);

  if (!origin) return { routes: [], origin: null };

  const aggregated = new Map<string, EarthRoute>();

  for (const connection of connections) {
    const countryCode = connection.metadata.destinationGeoIP?.[0]?.toUpperCase();
    const centroid = countryCode ? centroids[countryCode] : undefined;

    if (!centroid) continue;

    const destination: EarthLocation = {
      ip: destinationIP(connection.metadata.destinationIP) ?? "",
      latitude: centroid[0],
      longitude: centroid[1],
      city: "",
      country: countryCode!,
    };
    const direct =
      !(connection.chains?.length) || connection.chains.includes("DIRECT");
    const rawHost = (connection.metadata.host || connection.metadata.sniffHost || "")
      .trim()
      .replace(/\.$/, "");

    const path: EarthRoute["path"] = [
      { ...origin, role: "origin" },
      { ...destination, role: "destination" },
    ];
    const key = path.map((point) => `${point.role}:${coordinateKey(point)}`).join(">");
    const existing = aggregated.get(key);

    if (existing) {
      existing.direct &&= direct;
      existing.connections += 1;
      existing.upload += Math.max(0, connection.curUpload ?? 0);
      existing.download += Math.max(0, connection.curDownload ?? 0);
      existing.topHosts = mergeTopHosts(
        existing.topHosts,
        rawHost
          ? [{ host: rawHost.toLowerCase(), downloaded: Math.max(0, connection.download) }]
          : [],
      );
    } else {
      aggregated.set(key, {
        key,
        path,
        direct,
        connections: 1,
        upload: Math.max(0, connection.curUpload ?? 0),
        download: Math.max(0, connection.curDownload ?? 0),
        topHosts: rawHost
          ? [{ host: rawHost.toLowerCase(), downloaded: Math.max(0, connection.download) }]
          : [],
      });
    }
  }

  return { routes: [...aggregated.values()], origin };
};
