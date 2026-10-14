export const resolveCountryLabel = (
  label: string,
  countryCodes: Record<string, string>,
  countryNames: Intl.DisplayNames | null,
) => {
  const code = countryCodes[label] ?? label;
  return /^[A-Z]{2}$/.test(code) ? (countryNames?.of(code) ?? code) : code;
};

export const mergeCountryTraffic = (
  values: Map<string, number>,
  countryCodes: Record<string, string>,
  countryNames: Intl.DisplayNames | null,
) => {
  const merged = new Map<string, number>();
  for (const [label, value] of values) {
    const country = resolveCountryLabel(label, countryCodes, countryNames);
    merged.set(country, (merged.get(country) ?? 0) + value);
  }
  return merged;
};

export const resolveExitRegion = (node: string) => {
  const normalized = node.toLowerCase();
  if (!normalized || normalized === "direct" || normalized === "unknown")
    return normalized || "Unknown";
  const countryDefs: Array<[RegExp, string]> = [
    [/(hong\s*kong|香港|hk|hkg)/i, "Hong Kong"],
    [/(japan|日本|jp|tyo|nrt|hnd|osa)/i, "Japan"],
    [/(taiwan|台湾|tw|tpe)/i, "Taiwan"],
    [/(singapore|新加坡|sg|sgp)/i, "Singapore"],
    [/(korea|韩国|kr)/i, "South Korea"],
    [/(usa|united\s+states|america|美国|us|lax|sjc|sea)/i, "United States"],
    [/(united\s+kingdom|britain|英国|uk|lon)/i, "United Kingdom"],
    [/(germany|德国|de|fra)/i, "Germany"],
    [/(france|法国|fr|par)/i, "France"],
    [/(russia|俄罗斯|ru)/i, "Russia"],
    [/(united\s+arab\s+emirates|阿联酋|uae|dxb)/i, "United Arab Emirates"],
    [/(india|印度|in|bom)/i, "India"],
    [/(indonesia|印尼|id|jkt)/i, "Indonesia"],
    [/(netherlands|荷兰|nl|ams)/i, "Netherlands"],
    [/(switzerland|瑞士|ch)/i, "Switzerland"],
    [/(sweden|瑞典|se)/i, "Sweden"],
    [/(australia|澳大利亚|au|syd)/i, "Australia"],
    [/(canada|加拿大|ca|yvr|yto)/i, "Canada"],
    [/(brazil|巴西|br)/i, "Brazil"],
    [/(argentina|阿根廷|ar)/i, "Argentina"],
    [/(turkey|土耳其|tr|ist)/i, "Turkey"],
  ];
  const region =
    countryDefs.find(([pattern]) => pattern.test(normalized))?.[1] ??
    (/(cloudflare|akamai|fastly|unknown)/i.test(normalized) ? "Unknown" : node);
  return region.trim().replace(/\s+/g, " ");
};
