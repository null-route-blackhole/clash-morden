import { hierarchy, type HierarchyPointNode,tree } from "d3-hierarchy";

import type { TopologyNodeData } from "./topology-data";

const NODE_PADDING_X = 16;
const NODE_SPACING_Y = 50;
const LEVEL_GAP = 40;
const TOP_PADDING = 25;
const LEFT_PADDING = 16;
const RIGHT_PADDING = 16;

// 单例离屏 canvas 测字宽（照抄 metacubexd getTextWidth）
let measureCanvas: HTMLCanvasElement | null = null;

export const getTextWidth = (
  text: string,
  font: string = "600 11px sans-serif",
): number => {
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
};

export interface TopologyLayoutNode extends HierarchyPointNode<TopologyNodeData> {
  _width: number;
}

export interface TopologyLayoutLink {
  source: TopologyLayoutNode;
  target: TopologyLayoutNode;
  d: string;
}

export interface TopologyLayoutResult {
  nodes: TopologyLayoutNode[];
  links: TopologyLayoutLink[];
  width: number;
  height: number;
  translateX: number;
  translateY: number;
}

// d3.tree 布局 + 每层最大宽度 X 偏移（原样移植 metacubexd renderTree 的布局段）
export const layoutTopology = (
  data: TopologyNodeData,
  containerWidth: number,
): TopologyLayoutResult | null => {
  if (!data.children || data.children.length === 0) return null;

  // tree() 返回 HierarchyPointNode（带 x/y），直接接住返回值获得正确类型
  const root = tree<TopologyNodeData>()
    .nodeSize([NODE_SPACING_Y, 100])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.5))(
    hierarchy(data),
  );

  const nodeWidths = new Map<string, number>();
  const descendants = root.descendants();
  for (const d of descendants) {
    if (d.data.type !== "root") {
      const textWidth = getTextWidth(d.data.name);
      const hasChildren =
        (d.data.children && d.data.children.length > 0) ||
        (d.data._children && d.data._children.length > 0);
      const indicatorSpace = hasChildren ? 20 : 0;
      nodeWidths.set(d.data.id, textWidth + NODE_PADDING_X * 2 + indicatorSpace);
    }
  }

  const getNodeWidth = (d: HierarchyPointNode<TopologyNodeData>): number =>
    nodeWidths.get(d.data.id) ?? 80;

  const maxWidthPerLevel = new Map<number, number>();
  root.descendants().forEach((d) => {
    if (d.data.type !== "root") {
      const width = getNodeWidth(d);
      maxWidthPerLevel.set(
        d.depth,
        Math.max(maxWidthPerLevel.get(d.depth) ?? 0, width),
      );
    }
  });

  const levelXOffset = new Map<number, number>();
  let cumulativeX = 0;
  for (let depth = 1; depth <= maxWidthPerLevel.size; depth++) {
    const currentLevelWidth = maxWidthPerLevel.get(depth) ?? 100;
    if (depth === 1) {
      cumulativeX = currentLevelWidth / 2;
    } else {
      const prevLevelWidth = maxWidthPerLevel.get(depth - 1) ?? 100;
      cumulativeX += prevLevelWidth / 2 + LEVEL_GAP + currentLevelWidth / 2;
    }
    levelXOffset.set(depth, cumulativeX);
  }

  root.descendants().forEach((d) => {
    if (d.data.type !== "root" && d.depth > 0) {
      d.y = levelXOffset.get(d.depth) ?? d.y;
    }
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  root.each((d) => {
    const x = d.x ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (d.data.type !== "root") {
      const rightEdge = (d.y ?? 0) + getNodeWidth(d) / 2;
      if (rightEdge > maxY) maxY = rightEdge;
    }
  });

  const treeHeight = maxX - minX + NODE_SPACING_Y;
  const actualHeight = Math.max(400, treeHeight + TOP_PADDING + 40);
  const actualWidth = Math.max(
    containerWidth,
    maxY + LEFT_PADDING + RIGHT_PADDING,
  );

  const nodes = descendants
    .filter((d) => d.data.type !== "root")
    .map((d) => Object.assign(d, { _width: getNodeWidth(d) })) as TopologyLayoutNode[];

  const links = root
    .links()
    .filter((link) => link.source.data.type !== "root")
    .map((link) => {
      const source = link.source as unknown as TopologyLayoutNode;
      const target = link.target as unknown as TopologyLayoutNode;
      const sourceX = (source.y ?? 0) + source._width / 2;
      const sourceY = source.x;
      const targetX = (target.y ?? 0) - target._width / 2;
      const targetY = target.x;
      const midX = (sourceX + targetX) / 2;
      return {
        source,
        target,
        d: `M${sourceX},${sourceY} C${midX},${sourceY} ${midX},${targetY} ${targetX},${targetY}`,
      };
    });

  return {
    nodes,
    links,
    width: actualWidth,
    height: actualHeight,
    translateX: LEFT_PADDING,
    translateY: -minX + NODE_SPACING_Y / 2 + TOP_PADDING,
  };
};
