import "./overview-design.css";

import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import { alpha, Paper, useTheme } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { BaseErrorBoundary } from "@/components/base";
import type { StatCardProps } from "@/components/home/compact-stat-card";
import {
  TrafficGraph,
  type TrafficRef,
} from "@/components/layout/traffic-graph";
import { useConnectionData } from "@/hooks/use-connection-data";
import { useTrafficData } from "@/hooks/use-traffic-data";
import { useVisibility } from "@/hooks/use-visibility";
import { useVergeStore } from "@/stores";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";
import parseTraffic from "@/utils/parse-traffic";

import { getOverviewTrafficColors } from "./ant-colors";

// 流量统计：置顶无标题卡 —— 上方统计 tile（速率/连接/内存/累计流量），
// 下方流量趋势图（仿 zashboard ChartsCard 的「tiles 上图下」布局）
export const EnhancedTrafficStats = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const trafficGraph = useVergeStore((s) => s.verge.traffic_graph ?? true);
  const trafficRef = useRef<TrafficRef>(null);
  const pageVisible = useVisibility();
  const colorIntensity = useInterfaceStyleStore((s) => s.colorIntensity);
  const colorOpacity = useInterfaceStyleStore((s) => s.colorOpacity);
  const colors = useMemo(
    () =>
      getOverviewTrafficColors(
        theme.palette.mode === "dark",
        colorIntensity,
        colorOpacity,
      ),
    [theme.palette.mode, colorIntensity, colorOpacity],
  );

  // /traffic WS 只推速率；累计总量来自 /connections WS 的 uploadTotal/downloadTotal
  const {
    response: { data: traffic = { up: 0, down: 0 } },
  } = useTrafficData();
  const {
    response: {
      data: connectionData = {
        activeConnections: [],
        closedConnections: [],
        uploadTotal: 0,
        downloadTotal: 0,
      },
    },
  } = useConnectionData();

  // 给图表组件喂数据（与 layout-traffic 一致）
  useEffect(() => {
    if (trafficRef.current) trafficRef.current.appendData(traffic);
  }, [traffic]);

  const parsedData = useMemo(() => {
    const [up, upUnit] = parseTraffic(traffic.up);
    const [down, downUnit] = parseTraffic(traffic.down);
    const [uploadTotal, uploadTotalUnit] = parseTraffic(
      connectionData.uploadTotal,
    );
    const [downloadTotal, downloadTotalUnit] = parseTraffic(
      connectionData.downloadTotal,
    );

    return {
      up,
      upUnit,
      down,
      downUnit,
      uploadTotal,
      uploadTotalUnit,
      downloadTotal,
      downloadTotalUnit,
      connectionsCount: connectionData.activeConnections.length,
      closedCount: connectionData.closedConnections.length,
    };
  }, [traffic, connectionData]);

  // 3×2 按行配对：实时速度、连接数、累计流量。
  const statCards = useMemo(() => {
    const cards: StatCardProps[] = [
      // 每一行展示一组对应指标：实时速度、连接数、累计流量。
      {
        icon: <ArrowUpwardRoundedIcon fontSize="small" />,
        title: t("pages.connections.columns.uploadSpeed"),
        value: parsedData.up,
        unit: `${parsedData.upUnit}/s`,
        color: "info",
        accentColor: colors.upload,
      },
      {
        icon: <ArrowDownwardRoundedIcon fontSize="small" />,
        title: t("pages.connections.columns.downloadSpeed"),
        value: parsedData.down,
        unit: `${parsedData.downUnit}/s`,
        color: "primary",
        accentColor: colors.download,
      },
      {
        icon: <LinkRoundedIcon fontSize="small" />,
        title: t("pages.home.components.traffic.metrics.activeConnections"),
        value: parsedData.connectionsCount,
        unit: "",
        color: "success",
        accentColor: colors.active,
      },
      {
        icon: <InsightsRoundedIcon fontSize="small" />,
        title: t("pages.home.components.traffic.metrics.closedConnections"),
        value: parsedData.closedCount,
        unit: "",
        color: "error",
        accentColor: colors.closed,
      },
      {
        icon: <CloudUploadRoundedIcon fontSize="small" />,
        title: t("pages.connections.columns.totalUploaded"),
        value: parsedData.uploadTotal,
        unit: parsedData.uploadTotalUnit,
        color: "warning",
        accentColor: colors.totalUpload,
      },
      {
        icon: <CloudDownloadRoundedIcon fontSize="small" />,
        title: t("pages.connections.columns.totalDownloaded"),
        value: parsedData.downloadTotal,
        unit: parsedData.downloadTotalUnit,
        color: "secondary",
        accentColor: colors.totalDownload,
      },
    ];

    return cards;
  }, [t, parsedData, colors]);

  return (
    <BaseErrorBoundary>
      <Paper
        className="overview-design interface-card"
        elevation={0}
        sx={{
          borderRadius: 2,
          bgcolor: "background.paper",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}>
        <div className="ds-metrics">
          {statCards.map((card) => (
            <div key={card.title}>
              <span className="ds-metric-name">
                {card.icon}
                {card.title}
              </span>
              <strong style={{ color: card.accentColor }}>
                {card.value}
                <small>{card.unit}</small>
              </strong>
            </div>
          ))}
        </div>

        {/* 下方流量趋势图 */}
        {trafficGraph && pageVisible && (
          <Paper
            elevation={0}
            onClick={() => trafficRef.current?.toggleStyle()}
            sx={{
              height: 130,
              cursor: "pointer",
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              borderRadius: 2,
              overflow: "hidden",
            }}>
            <div style={{ height: "100%", position: "relative" }}>
              <TrafficGraph ref={trafficRef} colors={colors} />
            </div>
          </Paper>
        )}
      </Paper>
    </BaseErrorBoundary>
  );
};
