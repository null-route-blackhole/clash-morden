import { OS } from "@/utils/get-system";

export type KernelTab = "general" | "network" | "dns" | "tun" | "sniffer";
export type KernelField = {
  path: string;
  type:
    | "boolean"
    | "number"
    | "text"
    | "select"
    | "interfaces"
    | "list"
    | "map"
    | "auth";
  fallback: unknown;
  options?: string[];
  min?: number;
  max?: number;
  platform?: "macos" | "linux" | "not-windows";
};
export type KernelSection = {
  id: string;
  hint?: string;
  fields: KernelField[];
};
const bool = (path: string, fallback = false): KernelField => ({
  path,
  type: "boolean",
  fallback,
});
const num = (
  path: string,
  fallback: number,
  min = 0,
  max = 1_000_000,
): KernelField => ({ path, type: "number", fallback, min, max });
const text = (path: string, fallback = ""): KernelField => ({
  path,
  type: "text",
  fallback,
});
const select = (
  path: string,
  options: string[],
  fallback = options[0],
): KernelField => ({ path, type: "select", fallback, options });
const list = (
  path: string,
  fallback: (string | number)[] = [],
): KernelField => ({ path, type: "list", fallback });
const map = (path: string): KernelField => ({
  path,
  type: "map",
  fallback: {},
});

export const kernelSections: Record<KernelTab, KernelSection[]> = {
  general: [
    {
      id: "routing",
      fields: [
        bool("tcp-concurrent"),
        bool("unified-delay", true),
        { path: "interface-name", type: "interfaces", fallback: "" },
        select("find-process-mode", ["always", "strict", "off"]),
        bool("disable-keep-alive"),
        num("keep-alive-interval", 15, 1, 86400),
        num("keep-alive-idle", 15, 1, 86400),
      ],
    },
    {
      id: "cache",
      hint: "cache",
      fields: [
        bool("profile.store-selected", true),
        bool("profile.store-fake-ip", true),
        text("global-ua"),
        bool("etag-support", true),
      ],
    },
  ],
  network: [
    {
      id: "ports",
      hint: "ports",
      fields: [
        num("port", 0, 0, 65535),
        num("socks-port", 0, 0, 65535),
        { ...num("redir-port", 0, 0, 65535), platform: "not-windows" },
        { ...num("tproxy-port", 0, 0, 65535), platform: "linux" },
        num("mixed-port", 7890, 0, 65535),
      ],
    },
    {
      id: "globalNetwork",
      hint: "quic",
      fields: [
        bool("ipv6", true),
        bool("tcp-fast-open"),
        bool("mptcp"),
        select("app-quic-block", ["foreign", "off", "all"], "off"),
      ],
    },
    {
      id: "access",
      fields: [
        bool("allow-lan"),
        list("lan-allowed-ips", ["0.0.0.0/0", "::/0"]),
        list("lan-disallowed-ips"),
        { path: "authentication", type: "auth", fallback: [] },
        list("skip-auth-prefixes", ["127.0.0.1/8"]),
      ],
    },
  ],
  dns: [
    { id: "dnsStatus", fields: [bool("dns.enable")] },
    {
      id: "dnsBehavior",
      fields: [
        select("dns.enhanced-mode", ["fake-ip", "redir-host"]),
        bool("dns.ipv6"),
        bool("dns.respect-rules"),
        bool("dns.prefer-h3"),
        num("dns.ipv6-timeout", 100),
      ],
    },
    {
      id: "dnsInbound",
      fields: [
        text("dns.listen"),
        bool("dns.use-system-hosts", true),
        bool("dns.use-hosts", true),
      ],
    },
    {
      id: "fakeip",
      fields: [
        text("dns.fake-ip-range", "198.18.0.1/16"),
        text("dns.fake-ip-range6", "fc00::/18"),
        select("dns.fake-ip-filter-mode", ["blacklist", "whitelist"]),
        num("dns.fake-ip-ttl", 1),
        list("dns.fake-ip-filter", ["+.lan", "+.local"]),
      ],
    },
    {
      id: "nameservers",
      hint: "nameservers",
      fields: [
        list("dns.default-nameserver", ["223.5.5.5", "119.29.29.29"]),
        list("dns.nameserver", [
          "https://dns.alidns.com/dns-query",
          "https://doh.pub/dns-query",
        ]),
        list("dns.fallback"),
      ],
    },
    {
      id: "specialDns",
      hint: "specialDns",
      fields: [
        list("dns.proxy-server-nameserver"),
        list("dns.direct-nameserver"),
        bool("dns.direct-nameserver-follow-policy"),
      ],
    },
    {
      id: "policies",
      fields: [
        map("dns.nameserver-policy"),
        map("dns.proxy-server-nameserver-policy"),
        map("hosts"),
      ],
    },
    {
      id: "fallback",
      hint: "fallback",
      fields: [
        bool("dns.fallback-filter.geoip"),
        text("dns.fallback-filter.geoip-code", "CN"),
        list("dns.fallback-filter.ipcidr"),
        list("dns.fallback-filter.geosite"),
        list("dns.fallback-filter.domain"),
      ],
    },
    {
      id: "dnsTuning",
      fields: [
        select("dns.cache-algorithm", ["arc", "lru"]),
        num("dns.cache-max-size", 400),
      ],
    },
  ],
  tun: [
    { id: "tunStatus", fields: [bool("tun.enable")] },
    {
      id: "tunRouting",
      hint: "tunRouting",
      fields: [
        select("tun.stack", ["mips", "mixed", "system", "gvisor"]),
        bool("tun.auto-route"),
        bool("tun.auto-detect-interface"),
        bool("tun.strict-route"),
        bool("tun.endpoint-independent-nat"),
        bool("tun.disable-icmp-forwarding"),
      ],
    },
    {
      id: "darwin",
      hint: "darwin",
      fields: [
        { ...bool("tun.recvmsgx"), platform: "macos" },
        { ...bool("tun.sendmsgx"), platform: "macos" },
      ],
    },
    {
      id: "tunGeneral",
      fields: [
        num("tun.mtu", 9000, 576, 65535),
        text("tun.device", OS === "macos" ? "utun4" : "Mihomo"),
        num("tun.udp-timeout", 300, 1, 86400),
      ],
    },
    {
      id: "hijack",
      hint: "hijack",
      fields: [list("tun.dns-hijack", ["any:53", "tcp://any:53"])],
    },
    {
      id: "excludeRoute",
      hint: "excludeRoute",
      fields: [list("tun.route-exclude-address")],
    },
    {
      id: "interfaceFilter",
      hint: "interfaceFilter",
      fields: [list("tun.include-interface"), list("tun.exclude-interface")],
    },
    {
      id: "portFilter",
      hint: "portFilter",
      fields: [list("tun.exclude-src-port"), list("tun.exclude-dst-port")],
    },
    {
      id: "includeRoute",
      hint: "includeRoute",
      fields: [list("tun.route-address")],
    },
  ],
  sniffer: [
    {
      id: "sniffStatus",
      hint: "sniffStatus",
      fields: [bool("sniffer.enable")],
    },
    {
      id: "sniffBehavior",
      hint: "sniffBehavior",
      fields: [
        bool("sniffer.override-destination"),
        bool("sniffer.force-dns-mapping"),
        bool("sniffer.parse-pure-ip"),
      ],
    },
    {
      id: "sniffPorts",
      hint: "sniffPorts",
      fields: [
        list("sniffer.sniff.HTTP.ports", ["80", "8080-8880"]),
        bool("sniffer.sniff.HTTP.override-destination"),
        list("sniffer.sniff.TLS.ports", ["443", "8443"]),
        bool("sniffer.sniff.TLS.override-destination"),
        list("sniffer.sniff.QUIC.ports", ["443", "8443"]),
        bool("sniffer.sniff.QUIC.override-destination"),
      ],
    },
    {
      id: "forceSniff",
      hint: "forceSniff",
      fields: [list("sniffer.force-domain")],
    },
    {
      id: "skipSniff",
      hint: "skipSniff",
      fields: [
        list("sniffer.skip-domain", ["Mijia Cloud", "+.push.apple.com"]),
        list("sniffer.skip-src-address"),
        list("sniffer.skip-dst-address"),
      ],
    },
  ],
};

export const fieldAvailable = (field: KernelField) =>
  !field.platform ||
  field.platform === OS ||
  (field.platform === "not-windows" && OS !== "windows");
export const readPath = (
  config: Record<string, unknown>,
  path: string,
): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      config,
    );
export const writePath = (
  config: Record<string, unknown>,
  path: string,
  value: unknown,
) => {
  const parts = path.split(".");
  let target = config;
  for (const key of parts.slice(0, -1)) {
    target[key] ??= {};
    target = target[key] as Record<string, unknown>;
  }
  target[parts.at(-1)!] = value;
};
