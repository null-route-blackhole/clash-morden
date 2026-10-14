import assert from "node:assert/strict";

import { mockIPC } from "@tauri-apps/api/mocks";

import { COUNTRY_CENTROIDS } from "../src/assets/geo/country-centroids";
import { buildEarthRoutes } from "../src/components/home/earth/routes";
import type { IConnectionsItem } from "../src/hooks/use-connection-data";
import { resolveMapHost } from "../src/services/map-dns";

// Run with pnpm exec tsx scripts/check-map-routes.ts.
globalThis.window = {} as any;
let calls = 0;
let active = 0;
let peak = 0;
mockIPC(async (command, args: any) => {
  assert.equal(command, "query_map_dns");
  calls++;
  peak = Math.max(peak, ++active);
  await new Promise((resolve) => setTimeout(resolve, 2));
  active--;
  if (args.name === "failure.example") throw new Error("DNS unavailable");
  if (args.name === "ipv6.example" && args.recordType === "A") return { Answer: [] };
  return { Answer: [{ type: args.recordType === "A" ? 1 : 28, data: args.recordType === "A" ? "8.8.8.8" : "2001:4860:4860::8888", TTL: 60 }] };
});
const ips = await Promise.all(Array.from({ length: 20 }, (_, i) => resolveMapHost(`host${i}.example`)));
assert.equal(ips.filter(Boolean).length, 20);
assert.ok(peak <= 6);
await Promise.all([resolveMapHost("shared.example"), resolveMapHost("shared.example")]);
assert.equal(calls, 21);
await resolveMapHost("shared.example");
assert.equal(calls, 21);
assert.ok(await resolveMapHost("ipv6.example"));
assert.equal(await resolveMapHost("failure.example"), null);
const failedCalls = calls;
assert.equal(await resolveMapHost("failure.example"), null);
assert.equal(calls, failedCalls);
const connection = {
  metadata: { destinationIP: "", host: "shared.example", destinationGeoIP: [] },
  chains: ["Proxy"], upload: 1, download: 2,
} as unknown as IConnectionsItem;
const located = { ...connection, metadata: { ...connection.metadata, destinationIP: (await resolveMapHost(connection.metadata.host))! } };
const origin = { ip: "1.1.1.1", latitude: 1, longitude: 2, city: "Origin", country: "AU" };
const destination = { ip: "8.8.8.8", latitude: 3, longitude: 4, city: "Destination", country: "US" };
const lookup = async () => ({ "1.1.1.1": origin, "8.8.8.8": destination });
assert.equal((await buildEarthRoutes([connection], origin.ip, "en", lookup)).routes.length, 0);
const result = await buildEarthRoutes([located, located], origin.ip, "en", lookup);
assert.equal(result.routes.length, 1);
assert.equal(result.routes[0].connections, 2);
assert.equal(result.routes[0].topHosts[0].host, "shared.example");
const fallback = await buildEarthRoutes([{ ...located, metadata: { ...located.metadata, destinationGeoIP: ["US"] } }], origin.ip, "en", async () => ({ "1.1.1.1": origin }), null, COUNTRY_CENTROIDS);
assert.equal(fallback.routes.length, 1);
console.log("Map regression checks passed: domain routes, aggregation, country fallback, IPv6, caching, failure isolation and concurrency.");
