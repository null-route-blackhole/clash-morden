import ipaddr from "ipaddr.js";
import type { ConnectionMetaData } from "tauri-plugin-mihomo-api";

/** Use only an IP actually reported by the core; never resolve a proxy-side host locally. */
export const connectionDestinationIP = (
  metadata: ConnectionMetaData,
): string => {
  for (const value of [
    metadata.destinationIP,
    metadata.remoteDestination,
    metadata.host,
  ]) {
    if (!value) continue;
    if (ipaddr.isValid(value)) return value;
    const address = value.startsWith("[")
      ? value.slice(1, value.indexOf("]"))
      : value.replace(/:\d+$/, "");
    if (ipaddr.isValid(address)) return address;
  }
  return "";
};
