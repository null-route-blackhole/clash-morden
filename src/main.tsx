import "@/index.css";
import "@/services/i18n";

import { ResizeObserver } from "@juggle/resize-observer";
import React from "react";
import { createRoot } from "react-dom/client";

import { ManagedMihomoWebSocket } from "@/services/managedMihomoWs";

import App from "./App";

if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserver;
}

const mainElementId = "root";
const container = document.getElementById(mainElementId);
if (!container) {
  throw new Error(
    `No container '${mainElementId}' found to render application`,
  );
}

if (process.env.NODE_ENV !== "development") {
  // disable context menu
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

document.addEventListener("keydown", (event) => {
  // Disable WebView keyboard shortcuts
  const disabledShortcuts =
    ["F5", "F7"].includes(event.key) ||
    (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) ||
    ((event.ctrlKey || event.metaKey) &&
      ["F", "G", "H", "J", "P", "Q", "R", "U"].includes(
        event.key.toUpperCase(),
      ));
  if (disabledShortcuts) {
    event.preventDefault();
  }
});

// 页面关闭/刷新事件
window.addEventListener("beforeunload", async () => {
  console.log("beforeunload");
  // 强制清理所有 WebSocket 实例
  await ManagedMihomoWebSocket.cleanupAll();
});

window.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded");
  // 强制清理所有 WebSocket 实例
  await ManagedMihomoWebSocket.cleanupAll();
});

// 预热首页的可选卡片 chunk（空闲时加载，不阻塞首屏、不进入口 bundle）
const preloadHomePageCards = () => {
  void import("@/pages/home").then((module) => module.preloadHomePageCards());
};
if ("requestIdleCallback" in window) {
  window.requestIdleCallback(preloadHomePageCards, { timeout: 5000 });
} else {
  setTimeout(preloadHomePageCards, 2000);
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
