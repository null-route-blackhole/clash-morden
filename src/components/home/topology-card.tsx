import {
  alpha,
  Box,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { MoveVertical, Scan, Settings2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PauseRounded as PauseRoundedIcon } from "@/components/base/interface-icons";
import { PlayArrowRounded as PlayArrowRoundedIcon } from "@/components/base/interface-icons";
import { useConnectionData } from "@/hooks/use-connection-data";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";
import parseTraffic from "@/utils/parse-traffic";

import { CardLegend } from "./card-legend";
import { EnhancedCard } from "./enhanced-card";
import { ConnectionFlowChart } from "./topology/connection-flow-chart";
import { flowColor } from "./topology/flow-colors";
import {
  buildTopologyStats,
  buildTopologyTree,
  type TopologyNodeData,
  type TopologyNodeType,
} from "./topology/topology-data";
import { layoutTopology } from "./topology/topology-layout";

const MAX_NODES = 2000;
const NODE_H = 30;

// 节点类型 → MUI palette 颜色映射（照抄 metacubexd 的 daisyUI 语义）
const typeColor = (
  type: TopologyNodeType,
): "info" | "primary" | "secondary" | "success" | "warning" | "error" => {
  switch (type) {
    case "group":
      return "info";
    case "proxy":
      return "primary";
    case "rule":
      return "warning";
    case "client":
      return "success";
    case "port":
      return "warning";
    default:
      return "info";
  }
};

const hasChildren = (node: TopologyNodeData) =>
  (node.children && node.children.length > 0) ||
  (node._children && node._children.length > 0);

// 网络拓扑卡：实时连接六层层级树（移植 metacubexd NetworkTopology）
export const TopologyCard = ({
  view = "flow",
}: {
  view?: "flow" | "legacy";
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const {
    response: { data: connectionData = { activeConnections: [] } },
  } = useConnectionData();

  const [expanded, setExpanded] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [zoom, setZoom] = useState(() => {
    const saved = Number(localStorage.getItem(`topology-zoom-${view}-v1`));
    return Number.isFinite(saved) && saved >= 0.5 && saved <= 2 ? saved : 1;
  });
  useEffect(() => {
    localStorage.setItem(`topology-zoom-${view}-v1`, String(zoom));
  }, [zoom, view]);
  const storageKey = (name: string) => `topology-${view}-${name}-v1`;
  const [sourceMode, setSourceMode] = useState<"ip" | "process">(
    () => (localStorage.getItem(storageKey("source")) as "ip" | "process") || "ip",
  );
  const [collapseGroups, setCollapseGroups] = useState(
    () => localStorage.getItem(storageKey("collapse")) === "true",
  );
  const [showDestination, setShowDestination] = useState(
    () => localStorage.getItem(storageKey("destination")) !== "false",
  );
  useEffect(() => localStorage.setItem(storageKey("source"), sourceMode), [sourceMode, view]);
  useEffect(() => localStorage.setItem(storageKey("collapse"), String(collapseGroups)), [collapseGroups, view]);
  useEffect(() => localStorage.setItem(storageKey("destination"), String(showDestination)), [showDestination, view]);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [isPaused, setIsPaused] = useState(false);
  const [frozen, setFrozen] = useState<
    typeof connectionData.activeConnections | null
  >(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(420);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  // 拖拽平移（替代横向滚动条）：起点 + 累计位移
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const movedRef = useRef(false);
  const panRef = useRef(pan);
  panRef.current = pan;
  const layoutRef = useRef<ReturnType<typeof layoutTopology>>(null);

  // 暂停时冻结快照
  const connections =
    isPaused && frozen ? frozen : connectionData.activeConnections;

  // ResizeObserver
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      setContainerWidth(element.clientWidth || 800);
      setContainerHeight(element.clientHeight || 420);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [view, connections.length === 0]);

  const tree = useMemo(
    () =>
      buildTopologyTree(view === "legacy" ? connections : [], collapsedNodes),
    [connections, collapsedNodes, view],
  );

  const stats = useMemo(() => buildTopologyStats(connections), [connections]);

  // rAF 合并提交：连接推送 ~1s 一次，布局足够便宜，直接 memo 即可
  const layout = useMemo(
    () => layoutTopology(tree, containerWidth),
    [tree, containerWidth],
  );
  layoutRef.current = layout ?? null;

  const toggleCollapse = (nodeId: string, isCurrentlyCollapsed: boolean) => {
    const expandedKey = `expanded-${nodeId}`;
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (isCurrentlyCollapsed) {
        if (nodeId.startsWith("rule-") || nodeId.startsWith("client-")) {
          next.add(expandedKey);
        } else {
          next.delete(nodeId);
        }
      } else {
        if (nodeId.startsWith("rule-") || nodeId.startsWith("client-")) {
          next.delete(expandedKey);
        } else {
          next.add(nodeId);
        }
      }
      return next;
    });
  };

  // 拖拽平移：位移超过 4px 进入拖拽模式，节点点击在拖拽后忽略
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
    };
    movedRef.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const current = layoutRef.current;
    if (!state || !current) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
    movedRef.current = true;
    const maxX = Math.min(0, containerWidth - current.width);
    const maxY = Math.min(0, containerHeight - current.height);
    setPan({
      x: Math.min(0, Math.max(maxX, state.originX + dx)),
      y: Math.min(0, Math.max(maxY, state.originY + dy)),
    });
  };

  const finishDrag = () => {
    dragStateRef.current = null;
    // click 事件在 pointerup 之后触发，稍后复位 movedRef 供下一次点击判断
    setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const togglePause = () => {
    if (isPaused) {
      setFrozen(null);
    } else {
      setFrozen([...connectionData.activeConnections]);
    }
    setIsPaused(!isPaused);
  };

  const [totalTraffic, totalTrafficUnit] = parseTraffic(stats.totalTraffic);

  const legendItems: {
    type: TopologyNodeType;
    label: string;
    count?: number;
  }[] = [
    {
      type: "group",
      label: t("pages.home.components.topology.legend.proxyGroups"),
      count: stats.groupCount,
    },
    {
      type: "proxy",
      label: t("pages.home.components.topology.legend.proxyNodes"),
      count: stats.proxyCount,
    },
    {
      type: "rule",
      label: t("pages.home.components.topology.legend.rules"),
      count: stats.ruleCount,
    },
    {
      type: "client",
      label: t("pages.home.components.topology.legend.sourceIP"),
      count: stats.clientCount,
    },
    {
      type: "port",
      label: t("pages.home.components.topology.legend.sourcePort"),
    },
  ];

  const headerLegend =
    view === "legacy"
      ? legendItems.map(({ type, label, count }) => ({
          key: type,
          label,
          count,
          color: theme.palette[typeColor(type)].main,
        }))
      : [
          "source",
          "matchedRule",
          "group",
          "exit",
          ...(showDestination ? ["destination"] : []),
        ].map((key, index) => ({
          key,
          label: t(`pages.home.components.topology.${key}`),
          count: undefined,
          color: flowColor(
            index,
            theme.palette.mode === "dark",
            colorIntensity,
          ),
        }));

  const nodeCount = layout?.nodes.length ?? 0;

  return (
    <EnhancedCard
      iconKind="network"
      title={t(
        view === "legacy"
          ? "pages.home.components.topology.legacy"
          : "pages.overview.topology.title",
      )}
      icon={<PlayArrowRoundedIcon />}
      titleAction={undefined}
      iconColor="secondary"
      action={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            minWidth: 0,
            flexWrap: "nowrap",
            justifyContent: "flex-end",
            overflowX: "auto",
            "& .MuiFormControlLabel-label": {
              fontSize: 12,
              whiteSpace: "nowrap",
            },
          }}>
          <CardLegend items={headerLegend} />
          {view === "flow" && (
            <>
              <Tooltip title={t("pages.home.components.topology.settings")}>
                <IconButton
                  size="small"
                  aria-label={t("pages.home.components.topology.settings")}
                  onClick={(event) => setSettingsAnchor(event.currentTarget)}>
                  <Settings2 size={16} />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={settingsAnchor}
                open={Boolean(settingsAnchor)}
                onClose={() => setSettingsAnchor(null)}>
                <MenuItem dense disableRipple>
                  <FormControlLabel
                    sx={{ m: 0, minWidth: 190 }}
                    control={
                      <Switch
                        size="small"
                        checked={sourceMode === "process"}
                        onChange={(_, checked) =>
                          setSourceMode(checked ? "process" : "ip")
                        }
                      />
                    }
                    label={t("pages.home.components.topology.processMode")}
                  />
                </MenuItem>
                <MenuItem dense disableRipple>
                  <FormControlLabel
                    sx={{ m: 0, minWidth: 190 }}
                    control={
                      <Switch
                        size="small"
                        checked={collapseGroups}
                        onChange={(_, checked) => setCollapseGroups(checked)}
                      />
                    }
                    label={t("pages.home.components.topology.collapseGroups")}
                  />
                </MenuItem>
                <MenuItem dense disableRipple>
                  <FormControlLabel
                    sx={{ m: 0, minWidth: 190 }}
                    control={
                      <Switch
                        size="small"
                        checked={showDestination}
                        onChange={(_, checked) => setShowDestination(checked)}
                      />
                    }
                    label={t("pages.home.components.topology.targetToggle")}
                  />
                </MenuItem>
              </Menu>
            </>
          )}
          <Tooltip title={t("pages.home.components.topology.expandHeight")}>
            <IconButton
              size="small"
              aria-label={t("pages.home.components.topology.expandHeight")}
              aria-pressed={expanded}
              style={{
                color: expanded
                  ? "var(--mui-palette-primary-main)"
                  : "var(--mui-palette-text-disabled)",
              }}
              onClick={() => {
                setExpanded((value) => !value);
                setPan({ x: 0, y: 0 });
              }}>
              <MoveVertical size={16} />
            </IconButton>
          </Tooltip>
          {view === "flow" && (
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton
                size="small"
                aria-label={t("pages.home.components.topology.zoomOut")}
                title={t("pages.home.components.topology.zoomOut")}
                disabled={zoom <= 0.5}
                onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
                <ZoomOut size={16} />
              </IconButton>
              <IconButton
                size="small"
                aria-label={t("pages.home.components.topology.fit")}
                title={t("pages.home.components.topology.fit")}
                onClick={() => setZoom(1)}>
                <Scan size={16} />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {Math.round(zoom * 100)}%
              </Typography>
              <IconButton
                size="small"
                aria-label={t("pages.home.components.topology.zoomIn")}
                title={t("pages.home.components.topology.zoomIn")}
                disabled={zoom >= 2}
                onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>
                <ZoomIn size={16} />
              </IconButton>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {totalTraffic}
            {totalTrafficUnit}
          </Typography>
          <Tooltip
            title={
              isPaused
                ? t("pages.home.components.topology.resume")
                : t("pages.home.components.topology.pause")
            }>
            <IconButton
              size="small"
              onClick={togglePause}
              color={isPaused ? "warning" : "default"}>
              {isPaused ? (
                <PlayArrowRoundedIcon fontSize="small" />
              ) : (
                <PauseRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      }>
      {connections.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.topology.waiting")}
          </Typography>
        </Box>
      ) : view === "flow" ? (
        <ConnectionFlowChart
          connections={connections}
          sourceMode={sourceMode}
          showDestination={showDestination}
          collapseGroups={collapseGroups}
          zoom={zoom}
          expanded={expanded}
        />
      ) : nodeCount > MAX_NODES ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.home.components.topology.tooManyNodes")}
          </Typography>
        </Box>
      ) : !layout ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t("pages.overview.topology.empty")}
          </Typography>
        </Box>
      ) : (
        <Box
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerLeave={finishDrag}
          sx={{
            overflow: "hidden",
            height: expanded ? layout.height : 420,
            touchAction: "none",
            cursor: movedRef.current ? "grabbing" : "grab",
            userSelect: "none",
          }}>
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              willChange: "transform",
            }}>
            <svg
              width={layout.width}
              height={layout.height}
              style={{ minHeight: "25rem" }}>
              <title>{t("pages.overview.topology.title")}</title>
              <g
                transform={`translate(${layout.translateX}, ${layout.translateY})`}>
                {/* 连线 */}
                {layout.links.map((link) => (
                  <path
                    key={`${link.source.data.id}->${link.target.data.id}`}
                    d={link.d}
                    fill="none"
                    stroke={theme.palette.text.primary}
                    strokeOpacity={0.3}
                    strokeWidth={Math.max(
                      1,
                      Math.min(4, link.target.data.connections / 5),
                    )}
                  />
                ))}
                {/* 节点 */}
                {layout.nodes.map((d) => {
                  const fill = theme.palette[typeColor(d.data.type)].main;
                  const bg = alpha(fill, 0.15);
                  const [traffic, trafficUnit] = parseTraffic(d.data.traffic);
                  const title = `${d.data.name}\n${d.data.connections} connections\n${traffic}${trafficUnit}`;
                  return (
                    <g
                      key={d.data.id}
                      transform={`translate(${d.y ?? 0},${d.x})`}
                      style={{
                        cursor: hasChildren(d.data) ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        if (hasChildren(d.data)) {
                          toggleCollapse(d.data.id, d.data.collapsed ?? false);
                        }
                      }}>
                      <title>{title}</title>
                      <text
                        dy={-NODE_H / 2 - 4}
                        textAnchor="middle"
                        fill={fill}
                        fontSize="10px"
                        fontWeight="500">
                        {d.data.connections}
                      </text>
                      <rect
                        x={-d._width / 2}
                        y={-NODE_H / 2}
                        width={d._width}
                        height={NODE_H}
                        rx={6}
                        fill={bg}
                        stroke={fill}
                        strokeWidth={2}
                      />
                      {hasChildren(d.data) && (
                        <text
                          x={d._width / 2 - 12}
                          dy="0.35em"
                          textAnchor="middle"
                          fill={theme.palette.text.primary}
                          fontSize="14px"
                          fontWeight="700">
                          {d.data.collapsed ? "+" : "−"}
                        </text>
                      )}
                      <text
                        dy="0.31em"
                        textAnchor="middle"
                        fill={theme.palette.text.primary}
                        fontSize="11px"
                        fontWeight="600">
                        {d.data.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </Box>
      )}
    </EnhancedCard>
  );
};
