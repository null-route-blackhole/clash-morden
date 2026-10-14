import { useTheme } from "@mui/material";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { getTrafficColors } from "@/utils/traffic-colors";

const maxPoint = 30;
const FRAME_INTERVAL_MS = 1000;

const refLineAlpha = 1;
const refLineWidth = 2;

const upLineAlpha = 0.6;
const upLineWidth = 4;

const downLineAlpha = 1;
const downLineWidth = 4;

const defaultList = Array(maxPoint + 2).fill({ up: 0, down: 0 });

type TrafficData = { up: number; down: number };

export interface TrafficRef {
  appendData: (data: TrafficData) => void;
  toggleStyle: () => void;
}

/**
 * draw the traffic graph
 */
interface TrafficGraphProps {
  colors?: { upload: string; download: string };
}

export const TrafficGraph = forwardRef<TrafficRef, TrafficGraphProps>(
  ({ colors }, ref) => {
    const countRef = useRef(0);
    const styleRef = useRef(true);
    const listRef = useRef<TrafficData[]>(defaultList);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const cacheRef = useRef<TrafficData | null>(null);

    const { palette } = useTheme();

    useImperativeHandle(ref, () => ({
      appendData: (data: TrafficData) => {
        cacheRef.current = data;
      },
      toggleStyle: () => {
        styleRef.current = !styleRef.current;
      },
    }));

    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const zero = { up: 0, down: 0 };

      const handleData = () => {
        const data = cacheRef.current ? cacheRef.current : zero;
        cacheRef.current = null;

        const list = listRef.current;
        if (list.length > maxPoint + 2) list.shift();
        list.push(data);
        countRef.current = 0;

        timer = setTimeout(handleData, 1000);
      };

      handleData();

      return () => {
        if (timer) clearTimeout(timer);
      };
    }, []);

    // 逻辑尺寸 + DPR 适配：容器变化时重设 backing store（HiDPI 清晰渲染）
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const updateSize = () => {
        const width = canvas.clientWidth || 300;
        const height = canvas.clientHeight || 150;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        setSize({ width, height });
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      let raf = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const { divider } = palette;
      const lineColors = colors ?? getTrafficColors(palette.mode === "dark");
      const refLineColor = divider || "rgba(0, 0, 0, 0.12)";
      const upLineColor = lineColors.upload;
      const downLineColor = lineColors.download;

      // 坐标全部用 CSS 像素，由 setTransform 处理 DPR
      const { width, height } = size;
      if (!width || !height) return;
      context.setTransform(
        canvas.width / width,
        0,
        0,
        canvas.height / height,
        0,
        0,
      );
      const dx = width / maxPoint;
      const dy = height / 7;
      const l1 = dy;
      const l2 = dy * 4;

      const countY = (v: number) => {
        const h = height;

        if (v === 0) return h - 1;
        if (v <= 10) return h - (v / 10) * dy;
        if (v <= 100) return h - (v / 100 + 1) * dy;
        if (v <= 1024) return h - (v / 1024 + 2) * dy;
        if (v <= 10240) return h - (v / 10240 + 3) * dy;
        if (v <= 102400) return h - (v / 102400 + 4) * dy;
        if (v <= 1048576) return h - (v / 1048576 + 5) * dy;
        if (v <= 10485760) return h - (v / 10485760 + 6) * dy;
        return 1;
      };

      const drawBezier = (list: number[], offset: number) => {
        const points = list.map((y, i) => [
          (dx * (i - 1) - offset + 3) | 0,
          countY(y),
        ]);

        const x = points[0][0];
        const y = points[0][1];

        context.moveTo(x, y);

        for (let i = 1; i < points.length; i++) {
          const p1 = points[i];
          const p2 = points[i + 1] || p1;

          const x1 = (p1[0] + p2[0]) / 2;
          const y1 = (p1[1] + p2[1]) / 2;

          context.quadraticCurveTo(p1[0], p1[1], x1, y1);
          // x = x1;
          // y = y1;
        }
      };

      const drawLine = (list: number[], offset: number) => {
        const points = list.map((y, i) => [
          (dx * (i - 1) - offset) | 0,
          countY(y),
        ]);

        context.moveTo(points[0][0], points[0][1]);

        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          context.lineTo(p[0], p[1]);
        }
      };

      const drawGraph = (lastTime: number) => {
        const listUp = listRef.current.map((v) => v.up);
        const listDown = listRef.current.map((v) => v.down);
        const lineStyle = styleRef.current;

        const now = Date.now();
        const diff = now - lastTime;
        if (diff < FRAME_INTERVAL_MS) {
          raf = requestAnimationFrame(() => drawGraph(lastTime));
          return;
        }
        const temp = Math.min((diff / 1000) * dx + countRef.current, dx);
        const offset = countRef.current === 0 ? 0 : temp;
        countRef.current = temp;

        context.clearRect(0, 0, width, height);

        // Reference lines
        context.beginPath();
        context.globalAlpha = refLineAlpha;
        context.lineWidth = refLineWidth;
        context.strokeStyle = refLineColor;
        context.moveTo(0, l1);
        context.lineTo(width, l1);
        context.moveTo(0, l2);
        context.lineTo(width, l2);
        context.stroke();
        context.closePath();

        context.beginPath();
        context.globalAlpha = colors ? 1 : upLineAlpha;
        context.lineWidth = upLineWidth;
        context.strokeStyle = upLineColor;
        if (lineStyle) {
          drawBezier(listUp, offset);
        } else {
          drawLine(listUp, offset);
        }
        context.stroke();
        context.closePath();

        context.beginPath();
        context.globalAlpha = downLineAlpha;
        context.lineWidth = downLineWidth;
        context.strokeStyle = downLineColor;
        if (lineStyle) {
          drawBezier(listDown, offset);
        } else {
          drawLine(listDown, offset);
        }
        context.stroke();
        context.closePath();

        raf = requestAnimationFrame(() => drawGraph(now));
      };

      drawGraph(Date.now());

      return () => {
        cancelAnimationFrame(raf);
      };
    }, [palette, size, colors]);

    return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
  },
);
