import type { IClosedConnectionItem } from "@/hooks/use-connection-data";

export interface FlowNode {
  id: string;
  name: string;
  layer: number;
  count: number;
  traffic: number;
}

export const buildConnectionFlow = (
  connections: IClosedConnectionItem[],
  sourceMode: "ip" | "process",
  showDestination: boolean,
  collapseGroups = false,
) => {
  const paths: string[][] = [];
  const nodes = new Map<string, FlowNode>();
  const links = new Map<
    string,
    { source: string; target: string; count: number }
  >();
  const groupDepth = collapseGroups
    ? 1
    : connections.reduce(
        (depth, connection) => Math.max(depth, connection.chains.length - 1),
        1,
      );
  for (const connection of connections) {
    const { metadata, chains } = connection;
    const source =
      sourceMode === "process"
        ? metadata.process ||
          metadata.processPath.split(/[\\/]/).pop() ||
          metadata.sourceIP ||
          "Unknown"
        : metadata.sourceIP || "Unknown";
    const rule = connection.rulePayload
      ? `${connection.rule}: ${connection.rulePayload}`
      : connection.rule || "Unknown";
    const path: { name: string; layer: number }[] = [
      { name: source, layer: 0 },
      { name: rule, layer: 1 },
    ];
    // Mihomo reports the exit first; preserve every nested group in traversal order.
    (collapseGroups ? chains.slice(1, 2) : chains.slice(1).reverse()).forEach(
      (name, index) => {
        path.push({ name, layer: index + 2 });
      },
    );
    path.push({ name: chains[0] || "Unknown", layer: groupDepth + 2 });
    if (showDestination) {
      const host =
        metadata.host ||
        metadata.sniffHost ||
        metadata.destinationIP ||
        "Unknown";
      const address =
        host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
      path.push({
        name: metadata.destinationPort
          ? `${address}:${metadata.destinationPort}`
          : address,
        layer: groupDepth + 3,
      });
    }
    const nodePath: string[] = [];
    let previous: string | undefined;
    for (const { name, layer } of path) {
      const id = JSON.stringify([layer, name]);
      nodePath.push(id);
      let node = nodes.get(id);
      if (!node) {
        node = { id, name, layer, count: 0, traffic: 0 };
        nodes.set(id, node);
      }
      node.count++;
      node.traffic += connection.upload + connection.download;
      if (previous) {
        const key = JSON.stringify([previous, id]);
        const link = links.get(key) ?? {
          source: previous,
          target: id,
          count: 0,
        };
        link.count++;
        links.set(key, link);
      }
      previous = id;
    }
    paths.push(nodePath);
  }
  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
    groupDepth,
    paths,
  };
};
