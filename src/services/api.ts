import { getName, getVersion } from "@tauri-apps/api/app";
import { fetch } from "@tauri-apps/plugin-http";
import * as ipaddr from "ipaddr.js";
import {
  getProxies,
  getProxyProviders,
  getRuleProviders,
  type ProxyInfo,
} from "tauri-plugin-mihomo-api";

import type { IProxyGroupItem } from "@/components/proxy/use-render-list";

/// Get the Proxy information
export const calcuProxies = async () => {
  const proxyRecord = (await getProxies()).proxies;
  const providerRecord = await calcuProxyProviders();
  // TODO: it's need?
  // provider name map
  const providerMap = Object.fromEntries(
    Object.entries(providerRecord).flatMap(([_provider, item]) =>
      item.proxies.map((p) => [p.name, p]),
    ),
  );

  // compatible with proxy-providers
  const generateItem = (name: string) => {
    if (proxyRecord[name]) return proxyRecord[name];
    if (providerMap[name]) return providerMap[name];
    return {
      name,
      type: "Unknown",
      udp: false,
      xudp: false,
      tfo: false,
      history: [],
    } as unknown as ProxyInfo;
  };

  const { GLOBAL: global, DIRECT: direct, REJECT: reject } = proxyRecord;

  let groups: IProxyGroupItem[] = Object.values(proxyRecord).reduce<
    IProxyGroupItem[]
  >((acc, each) => {
    if (each?.name !== "GLOBAL" && each?.all) {
      acc.push({
        ...each,
        all: each.all.map((item) => generateItem(item)),
      });
    }

    return acc;
  }, []);

  if (global?.all) {
    const globalGroups: IProxyGroupItem[] = global.all.reduce<
      IProxyGroupItem[]
    >((acc, name) => {
      if (proxyRecord[name]?.all) {
        acc.push({
          ...proxyRecord[name],
          all: proxyRecord[name].all.map((item) => generateItem(item)),
        });
      }
      return acc;
    }, []);

    const globalNames = new Set(globalGroups.map((each) => each.name));
    groups = groups
      .filter((group) => {
        return !globalNames.has(group.name);
      })
      .concat(globalGroups);
  }

  const proxies = [direct, reject].concat(
    Object.values(proxyRecord).filter(
      (p) => !p?.all?.length && p?.name !== "DIRECT" && p?.name !== "REJECT",
    ),
  );

  const _global: IProxyGroupItem = {
    ...global,
    all: global?.all?.map((item) => generateItem(item)) || [],
  };

  const res = {
    global: _global,
    direct,
    groups,
    records: proxyRecord,
    proxies,
  };
  return res;
};

// get proxy providers
export const calcuProxyProviders = async () => {
  const providers = await getProxyProviders();
  return Object.fromEntries(
    Object.entries(providers.providers)
      .sort()
      .filter(
        ([_key, item]) =>
          item.vehicleType === "HTTP" ||
          item.vehicleType === "File" ||
          item.vehicleType === "Inline",
      ),
  );
};

export const calcuRuleProviders = async () => {
  const providers = await getRuleProviders();
  return Object.fromEntries(
    Object.entries(providers.providers)
      .sort()
      .filter(
        ([_key, item]) =>
          item.vehicleType === "HTTP" ||
          item.vehicleType === "File" ||
          item.vehicleType === "Inline",
      ),
  );
};
// ---- IP 信息检测（首页「网络信息」双源卡使用，逻辑照抄 zashboard IPCheck）----

export enum IP_INFO_API {
  IPIP = "ipip.net",
  IPSB = "ip.sb",
  IPWHOIS = "ipwho.is",
  IPAPI = "ipapi.is",
}

export interface IpInfo {
  ip: string;
  country: string;
  region: string;
  city: string;
  asn: string;
  organization: string;
  latitude: number | null;
  longitude: number | null;
}

export const randomPublicIp = () => {
  const first = 1 + Math.floor(Math.random() * 223);
  const second = Math.floor(Math.random() * 256);
  const third = Math.floor(Math.random() * 256);
  const fourth = 1 + Math.floor(Math.random() * 254);
  return `${first}.${second}.${third}.${fourth}`;
};

const coordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// 直接失败（HTTP 状态 / JSON 解析 / 响应缺 ip）：不再重试
class BailError extends Error {}

let userAgentPromise: Promise<string> | null = null;

const getUserAgent = () => {
  userAgentPromise ??= (async () => {
    try {
      const [name, version] = await Promise.all([getName(), getVersion()]);
      return `${name}/${version}`;
    } catch {
      return "ClashMorden";
    }
  })();
  return userAgentPromise;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: timeoutController.signal,
      connectTimeout: 5000,
      headers: {
        "User-Agent": await getUserAgent(),
      },
    });

    if (!response.ok) {
      throw new BailError(`${url} lookup failed: ${response.status}`);
    }

    const data: unknown = await response.json();
    return data;
  } catch (error) {
    if (error instanceof BailError) throw error;
    // AbortError 或网络错误统一抛 BailError（不重试，UI 层展示失败态）
    throw new BailError(`${url} lookup failed`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const getIPFromIpipnetAPI = async () => {
  const data = (await fetchJson("https://myip.ipip.net/json")) as {
    ret: string;
    data: {
      ip: string;
      location: string[];
    };
  };
  if (data.ret !== "ok" || !ipaddr.isValid(data.data?.ip)) {
    throw new BailError("IPIP.net lookup failed");
  }
  return data;
};

const getIPFromIPWhoisAPI = async (ip = "") => {
  const data = (await fetchJson(`https://ipwho.is${ip ? `/${ip}` : ""}`)) as
    | {
        ip: string;
        success: true;
        country?: string;
        region?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        connection?: {
          asn?: number;
          org?: string;
        };
      }
    | {
        ip?: string;
        success: false;
        message: string;
      };
  if (!data.success) {
    throw new BailError(`ipwho.is lookup failed: ${data.message}`);
  }
  return data;
};

const getIPFromIPapiisAPI = async (ip = "") => {
  const data = (await fetchJson(`https://api.ipapi.is${ip ? `/?q=${ip}` : ""}`)) as
    | {
        ip: string;
        company_name: string | null;
        asn_num: number | null;
        asn_org: string | null;
        cc: string | null;
        lat: number | null;
        lon: number | null;
      }
    | {
        error: string;
      };
  if ("error" in data) {
    throw new BailError(`ipapi.is lookup failed: ${data.error}`);
  }
  return data;
};

const getIPFromIpsbAPI = async (ip = "") => {
  const data = (await fetchJson(`https://api.ip.sb/geoip${ip ? `/${ip}` : ""}`)) as {
    ip: string;
    organization?: string;
    asn_organization?: string;
    asn?: number;
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  if (!ipaddr.isValid(data.ip)) {
    throw new BailError("ip.sb lookup failed");
  }
  return data;
};

/** 指定服务查询本机公网 IP（ipip.net 仅支持公网探测，不带 ip 参数） */
export const getPublicIpInfo = async (
  api: IP_INFO_API,
  lookupIp?: string,
): Promise<IpInfo & { lastFetchTs: number }> => {
  let info: IpInfo;

  if (api === IP_INFO_API.IPIP && !lookupIp) {
    const ipip = await getIPFromIpipnetAPI();
    const [country = "", region = "", city = "", ...organizationParts] =
      ipip.data.location ?? [];
    info = {
      ip: ipip.data.ip,
      country,
      region,
      city,
      asn: "",
      organization: organizationParts.filter(Boolean).join(" "),
      latitude: null,
      longitude: null,
    };
  } else if (api === IP_INFO_API.IPWHOIS || api === IP_INFO_API.IPIP) {
    const ipwhois = await getIPFromIPWhoisAPI(lookupIp);
    info = {
      ip: ipwhois.ip,
      country: ipwhois.country ?? "",
      region: ipwhois.region ?? "",
      city: ipwhois.city ?? "",
      asn: ipwhois.connection?.asn?.toString() ?? "",
      organization: ipwhois.connection?.org ?? "",
      latitude: coordinate(ipwhois.latitude),
      longitude: coordinate(ipwhois.longitude),
    };
  } else if (api === IP_INFO_API.IPAPI) {
    const ipapi = await getIPFromIPapiisAPI(lookupIp);
    info = {
      ip: ipapi.ip,
      country: ipapi.cc ?? "",
      region: "",
      city: "",
      asn: ipapi.asn_num?.toString() ?? "",
      organization: ipapi.asn_org ?? ipapi.company_name ?? "",
      latitude: coordinate(ipapi.lat),
      longitude: coordinate(ipapi.lon),
    };
  } else {
    const ipsb = await getIPFromIpsbAPI(lookupIp);
    info = {
      ip: ipsb.ip,
      country: ipsb.country ?? "",
      region: ipsb.region ?? "",
      city: ipsb.city ?? "",
      asn: ipsb.asn?.toString() ?? "",
      organization: ipsb.organization ?? ipsb.asn_organization ?? "",
      latitude: coordinate(ipsb.latitude),
      longitude: coordinate(ipsb.longitude),
    };
  }

  return Object.assign(info, { lastFetchTs: Date.now() });
};
