import type { CountryResponse } from "mmdb-lib";

import {
  AsyncMMDBReader,
  type MMDBByteSource,
} from "@/components/home/earth/mmdb";
import { getCountryMmdbBytes } from "@/services/cmds";

// 兜底 GeoIP：用应用自带的 Country.mmdb（内核未填充 destinationGeoIP 时使用）。
// 字节通过 Tauri 命令读取一次并缓存，解析复用地球卡移植的 AsyncMMDBReader。

let readerPromise: Promise<AsyncMMDBReader<CountryResponse> | null> | null = null;

const getReader = () => {
  readerPromise ??= (async () => {
    try {
      const raw = await getCountryMmdbBytes();
      const bytes = new Uint8Array(raw);
      const source: MMDBByteSource = {
        size: bytes.length,
        async read(offset, length) {
          return bytes.slice(offset, offset + length);
        },
      };
      const reader = await AsyncMMDBReader.open<CountryResponse>(source);
      return reader.metadata.nodeCount > 0 ? reader : null;
    } catch (error) {
      console.warn("[geoip] Country.mmdb unavailable:", error);
      return null;
    }
  })();
  return readerPromise;
};

/** 单 IP → ISO 国家码（查不到返回 null） */
export const lookupCountryCode = async (ip: string): Promise<string | null> => {
  const reader = await getReader();
  if (!reader) return null;
  try {
    const result = await reader.get(ip);
    return result?.country?.iso_code ?? null;
  } catch {
    return null;
  }
};

/** 批量 IP → { ip: 国家码 }（查不到的项省略） */
export const lookupCountryCodes = async (
  ips: string[],
): Promise<Record<string, string>> => {
  const reader = await getReader();
  const result: Record<string, string> = {};

  if (!reader) return result;

  await Promise.all(
    ips.map(async (ip) => {
      try {
        const code = (await reader.get(ip))?.country?.iso_code;
        if (code) result[ip] = code;
      } catch {
        // 查不到忽略
      }
    }),
  );

  return result;
};
