import type { IClosedConnectionItem } from "@/hooks/use-connection-data";

export type TopologyNodeType =
  | "root"
  | "client"
  | "port"
  | "rule"
  | "group"
  | "proxy";

export interface TopologyNodeData {
  id: string;
  name: string;
  type: TopologyNodeType;
  connections: number;
  traffic: number;
  children?: TopologyNodeData[];
  _children?: TopologyNodeData[];
  collapsed?: boolean;
  subtitle?: string;
}

// 层级构建：root -> group(chains[1]||chains[0]) -> proxy(chains[0]) -> rule -> client -> port
// 原样移植 metacubexd NetworkTopology.vue 的 hierarchyData（去掉 reverseDns 标签）
export const buildTopologyTree = (
  connections: IClosedConnectionItem[],
  collapsedNodes: Set<string>,
): TopologyNodeData => {
  const groupsMap = new Map<
    string,
    {
      data: TopologyNodeData;
      proxies: Map<
        string,
        {
          data: TopologyNodeData;
          rules: Map<
            string,
            {
              data: TopologyNodeData;
              clients: Map<
                string,
                {
                  data: TopologyNodeData;
                  ports: Map<string, TopologyNodeData>;
                }
              >;
            }
          >;
        }
      >;
    }
  >();

  connections.forEach((conn) => {
    const clientIP = conn.metadata.sourceIP || "Unknown";
    const sourcePort = String(conn.metadata.sourcePort || "Unknown");
    const ruleType = conn.rule || "Direct";
    const rulePayload = conn.rulePayload;
    const fullRule = rulePayload ? `${ruleType}: ${rulePayload}` : ruleType;
    const chains = conn.chains || [];
    const proxy = chains[0] ?? "Direct";
    const group: string =
      chains.length > 1 ? (chains[1] ?? "Direct") : (chains[0] ?? "Direct");
    const traffic = conn.download + conn.upload;

    if (!groupsMap.has(group)) {
      groupsMap.set(group, {
        data: {
          id: `group-${group}`,
          name: group,
          type: "group",
          connections: 0,
          traffic: 0,
        },
        proxies: new Map(),
      });
    }
    const groupEntry = groupsMap.get(group)!;
    groupEntry.data.connections++;
    groupEntry.data.traffic += traffic;

    if (!groupEntry.proxies.has(proxy)) {
      groupEntry.proxies.set(proxy, {
        data: {
          id: `proxy-${group}-${proxy}`,
          name: proxy,
          type: "proxy",
          connections: 0,
          traffic: 0,
        },
        rules: new Map(),
      });
    }
    const proxyEntry = groupEntry.proxies.get(proxy)!;
    proxyEntry.data.connections++;
    proxyEntry.data.traffic += traffic;

    if (!proxyEntry.rules.has(fullRule)) {
      proxyEntry.rules.set(fullRule, {
        data: {
          id: `rule-${group}-${proxy}-${fullRule}`,
          name: fullRule,
          type: "rule",
          connections: 0,
          traffic: 0,
        },
        clients: new Map(),
      });
    }
    const ruleEntry = proxyEntry.rules.get(fullRule)!;
    ruleEntry.data.connections++;
    ruleEntry.data.traffic += traffic;

    if (!ruleEntry.clients.has(clientIP)) {
      ruleEntry.clients.set(clientIP, {
        data: {
          id: `client-${group}-${proxy}-${fullRule}-${clientIP}`,
          name: clientIP,
          subtitle: clientIP,
          type: "client",
          connections: 0,
          traffic: 0,
        },
        ports: new Map(),
      });
    }
    const clientEntry = ruleEntry.clients.get(clientIP)!;
    clientEntry.data.connections++;
    clientEntry.data.traffic += traffic;

    if (!clientEntry.ports.has(sourcePort)) {
      clientEntry.ports.set(sourcePort, {
        id: `port-${group}-${proxy}-${fullRule}-${clientIP}-${sourcePort}`,
        name: sourcePort,
        type: "port",
        connections: 0,
        traffic: 0,
      });
    }
    const portNode = clientEntry.ports.get(sourcePort)!;
    portNode.connections++;
    portNode.traffic += traffic;
  });

  const rootChildren: TopologyNodeData[] = [];

  const applyCollapseState = (
    node: TopologyNodeData,
    defaultCollapsed: boolean = false,
  ): TopologyNodeData => {
    const isCollapsed = collapsedNodes.has(node.id) || defaultCollapsed;
    if (isCollapsed && node.children && node.children.length > 0) {
      return {
        ...node,
        _children: node.children,
        children: undefined,
        collapsed: true,
      };
    }
    return { ...node, collapsed: false };
  };

  groupsMap.forEach((groupEntry) => {
    const groupNode: TopologyNodeData = {
      ...groupEntry.data,
      children: [] as TopologyNodeData[],
    };

    groupEntry.proxies.forEach((proxyEntry) => {
      const proxyNode: TopologyNodeData = {
        ...proxyEntry.data,
        children: [] as TopologyNodeData[],
      };

      proxyEntry.rules.forEach((ruleEntry) => {
        const ruleNode: TopologyNodeData = {
          ...ruleEntry.data,
          children: [] as TopologyNodeData[],
        };

        ruleEntry.clients.forEach((clientEntry) => {
          const portChildren = Array.from(clientEntry.ports.values());
          const isClientCollapsed = !collapsedNodes.has(
            `expanded-${clientEntry.data.id}`,
          );
          const clientNode: TopologyNodeData = isClientCollapsed
            ? {
                ...clientEntry.data,
                _children: portChildren,
                children: undefined,
                collapsed: true,
              }
            : {
                ...clientEntry.data,
                children: portChildren,
                collapsed: false,
              };
          ruleNode.children!.push(clientNode);
        });

        const isRuleCollapsed = !collapsedNodes.has(
          `expanded-${ruleEntry.data.id}`,
        );
        if (isRuleCollapsed && ruleNode.children!.length > 0) {
          ruleNode._children = ruleNode.children;
          ruleNode.children = undefined;
          ruleNode.collapsed = true;
        } else {
          ruleNode.collapsed = false;
        }
        proxyNode.children!.push(ruleNode);
      });

      const processedProxyNode = applyCollapseState(proxyNode);
      groupNode.children!.push(processedProxyNode);
    });

    const processedGroupNode = applyCollapseState(groupNode);
    rootChildren.push(processedGroupNode);
  });

  return {
    id: "root",
    name: "Connections",
    type: "root",
    connections: connections.length,
    traffic: connections.reduce((sum, c) => sum + c.download + c.upload, 0),
    children: rootChildren,
  };
};

export interface TopologyStats {
  clientCount: number;
  ruleCount: number;
  groupCount: number;
  proxyCount: number;
  totalTraffic: number;
}

export const buildTopologyStats = (
  connections: IClosedConnectionItem[],
): TopologyStats => {
  const clientSet = new Set<string>();
  const ruleSet = new Set<string>();
  const groupSet = new Set<string>();
  const proxySet = new Set<string>();

  connections.forEach((conn) => {
    clientSet.add(conn.metadata.sourceIP || "Unknown");
    ruleSet.add(conn.rule || "Direct");
    const chains = conn.chains || [];
    proxySet.add(chains[0] ?? "Direct");
    groupSet.add(
      chains.length > 1 ? (chains[1] ?? "Direct") : (chains[0] ?? "Direct"),
    );
  });

  return {
    clientCount: clientSet.size,
    ruleCount: ruleSet.size,
    groupCount: groupSet.size,
    proxyCount: proxySet.size,
    totalTraffic: connections.reduce(
      (sum, c) => sum + c.download + c.upload,
      0,
    ),
  };
};
