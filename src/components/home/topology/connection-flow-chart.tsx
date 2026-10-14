import { Box, Typography, useTheme } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { IClosedConnectionItem } from "@/hooks/use-connection-data";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";
import parseTraffic from "@/utils/parse-traffic";

import { buildConnectionFlow } from "./connection-flow";
import { flowColor, flowRole } from "./flow-colors";
import { fitFlowColumns } from "./flow-layout";

export const ConnectionFlowChart = ({
  connections,
  sourceMode,
  showDestination,
  collapseGroups = false,
  zoom = 0.75,
  expanded = false,
}: {
  connections: IClosedConnectionItem[];
  sourceMode: "ip" | "process";
  showDestination: boolean;
  collapseGroups?: boolean;
  zoom?: number;
  expanded?: boolean;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(600);

  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    active: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const flow = useMemo(
    () =>
      buildConnectionFlow(
        connections,
        sourceMode,
        showDestination,
        collapseGroups,
      ),
    [connections, sourceMode, showDestination, collapseGroups],
  );
  const highlighted = useMemo(() => {
    const edges = new Set<string>();
    if (hovered)
      for (const path of flow.paths) {
        if (!path.includes(hovered)) continue;
        for (let index = 1; index < path.length; index++)
          edges.add(JSON.stringify([path[index - 1], path[index]]));
      }
    return edges;
  }, [flow, hovered]);
  const hoveredTrajectories = useMemo(() => {
    if (!hovered) return "";
    const names = new Map(flow.nodes.map((node) => [node.id, node.name]));
    const paths = new Set(
      flow.paths
        .filter((path) => path.includes(hovered))
        .map((path) => path.map((id) => names.get(id)).join(" → ")),
    );
    return [...paths].slice(0, 12).join("\n") + (paths.size > 12 ? "\n…" : "");
  }, [flow, hovered]);
  const layout = useMemo(() => {
    const columns = Array.from(
      { length: flow.groupDepth + (showDestination ? 4 : 3) },
      (_, layer) =>
        flow.nodes
          .filter((node) => node.layer === layer)
          .sort((a, b) => a.name.localeCompare(b.name)),
    );
    const height = Math.max(
      390,
      ...columns.map((column) => column.length * 46 + 55),
    );
    const context = document.createElement("canvas").getContext("2d");
    const fontFamily = theme.typography.fontFamily;
    const measure = (text: string, size: number) => {
      if (!context) return Array.from(text).length * size;
      context.font = `${size}px ${fontFamily}`;
      return context.measureText(text).width;
    };
    const naturalSizes = columns.map((column) => {
      const labelWidth = column.length
        ? Math.ceil(Math.max(...column.map((node) => measure(node.name, 11))))
        : 0;
      const countWidth = Math.ceil(
        Math.max(0, ...column.map((node) => measure(String(node.count), 10))),
      );
      return { width: Math.max(64, 32 + labelWidth + countWidth), countWidth };
    });
    const columnSizes = fitFlowColumns(naturalSizes, viewportWidth, zoom);
    let right = 16;
    const offsets = columnSizes.map(({ width }) => {
      const x = right;
      right += width + 36;
      return x;
    });
    const positions = new Map(
      columns.flatMap((column, layer) =>
        column.map(
          (node, index) =>
            [
              node.id,
              {
                x: offsets[layer],
                layer,
                ...columnSizes[layer],
                y: 55 + index * ((height - 55) / Math.max(1, column.length)),
              },
            ] as const,
        ),
      ),
    );
    return { positions, height, width: right - 36 + 16 };
  }, [flow, showDestination, theme.typography.fontFamily, viewportWidth, zoom]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [flow.nodes.length > 2000]);
  const previousZoom = useRef(zoom);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      if (zoom === 1) {
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      } else
        viewport.scrollTop =
          ((viewport.scrollTop + viewport.clientHeight / 2) * zoom) /
            previousZoom.current -
          viewport.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  const color = (layer: number) =>
    flowColor(
      flowRole(layer, flow.groupDepth),
      theme.palette.mode === "dark",
      colorIntensity,
    );
  if (flow.nodes.length > 2000)
    return (
      <Typography sx={{ py: 8 }}>
        {t("pages.home.components.topology.tooManyNodes")}
      </Typography>
    );
  return (
    <Box
      ref={viewportRef}
      onPointerDown={(event) => {
        if (
          !event.isPrimary ||
          (event.pointerType === "mouse" && event.button !== 0)
        )
          return;
        const element = event.currentTarget;
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: element.scrollLeft,
          top: element.scrollTop,
          active: false,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.active) {
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5)
            return;
          drag.active = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          setHovered(null);
        }
        event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
        event.currentTarget.scrollTop = drag.top - (event.clientY - drag.y);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
        setDragging(false);
      }}
      onPointerLeave={() => {
        if (!dragRef.current?.active) dragRef.current = null;
        setHovered(null);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      sx={{
        height: expanded ? layout.height * zoom : 420,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        cursor: dragging ? "grabbing" : "grab",
      }}>
      <svg
        width={layout.width * zoom}
        height={layout.height * zoom}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={t("pages.overview.topology.title")}
        style={{ display: "block" }}>
        <title>{t("pages.home.components.topology.flow")}</title>
        {flow.links.map((link) => {
          const source = layout.positions.get(link.source)!;
          const target = layout.positions.get(link.target)!;
          const start = source.x + source.width;
          const end = target.x;
          const active =
            !hovered ||
            highlighted.has(JSON.stringify([link.source, link.target]));
          return (
            <path
              key={JSON.stringify([link.source, link.target])}
              d={`M${start},${source.y + 14} C${(start + end) / 2},${source.y + 14} ${(start + end) / 2},${target.y + 14} ${end},${target.y + 14}`}
              fill="none"
              stroke={color(source.layer)}
              strokeOpacity={active ? 0.45 : 0.07}
              strokeWidth={Math.min(12, 1 + Math.log2(link.count + 1) * 2)}>
              <title>
                {link.count} {t("pages.home.components.topology.connections")}
              </title>
            </path>
          );
        })}
        {flow.nodes.map((node) => {
          const position = layout.positions.get(node.id)!;
          const fill = color(node.layer);
          return (
            <g
              key={node.id}
              transform={`translate(${position.x},${position.y})`}
              onMouseEnter={() => {
                if (!dragRef.current?.active) setHovered(node.id);
              }}
              onMouseLeave={() => setHovered(null)}>
              <title>{`${node.name}\n${node.count} ${t("pages.home.components.topology.connections")}\n${parseTraffic(node.traffic).join(" ")}${hovered === node.id ? `\n${hoveredTrajectories}` : ""}`}</title>
              <rect
                width={position.width}
                height={28}
                rx={5}
                fill={theme.palette.background.paper}
                stroke={fill}
              />
              <rect width={5} height={28} rx={2} fill={fill} />
              <foreignObject
                x={12}
                y={0}
                width={position.labelWidth}
                height={28}>
                <div
                  title={node.name}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: "28px",
                    fontSize: 11,
                    fontFamily: theme.typography.fontFamily,
                    color: theme.palette.text.primary,
                  }}>
                  {node.name}
                </div>
              </foreignObject>
              <text
                x={position.width - 8}
                y={18}
                textAnchor="end"
                fill={theme.palette.text.secondary}
                fontSize={10}>
                {node.count}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
};
