# ClashMorden

[简体中文](README.zh-CN.md) | [English](README.md)

<p align="center">
  <img src="./docs/assets/dock.png" alt="ClashMorden" width="220" />
</p>

<p align="center"><strong>为 Mihomo 打造的全新桌面管理界面。</strong></p>

ClashMorden 是基于 Clash Verge Rev 开发的社区界面项目。在保留熟悉的代理客户端操作方式的基础上，重新设计了概览页、连接信息展示和整体主题风格。相较原版的界面更新

- **重新设计的概览页：** 面板可按需编排，集中查看流量、延迟、连接活动、规则、域名和代理节点。
- **连接拓扑：** 以图形方式查看活动连接及其经过的代理链路。
- **流量与目标统计：** 查看连接历史，并按目标、进程、规则和代理节点汇总流量。
- **网络地图：** 在地图或地球视图中查看连接目标位置，并可切换 2D 与 3D 展示。
- **全新主题风格：** 更新布局间距、字体、色彩和组件样式，内置 6 套主题，支持浅色/深色模式与主题色调整。
- **更清晰的配置入口：** 将配置订阅、代理组、规则、连接和内核设置整理到独立页面。
- **配置增强脚本：** 在订阅配置的处理链中运行 JavaScript 增强脚本，可在激活或重新增强配置时自动调整配置内容。
- **应用插件脚本：** 创建或导入在应用网页界面中运行的 JavaScript 脚本，可添加样式、响应页面切换并保存脚本数据，也支持从远程地址更新脚本。

增强脚本和插件脚本都可能读取或修改配置，插件脚本也可以与应用界面交互。请先审查脚本代码和远程订阅来源，只启用可信来源的脚本。

## 界面预览

<p align="center">
  <img src="./docs/assets/Preview1.png" alt="ClashMorden 概览页" width="900" />
</p>

<p align="center">
  <img src="./docs/assets/Preview2.png" alt="ClashMorden 配置与脚本页面" width="900" />
</p>

## 本地开发

桌面界面基于 Tauri。运行前请安装 Node.js、pnpm、Rust 和 Tauri 所需的平台依赖：

```shell
pnpm install
pnpm dev
```

仅构建前端资源：

```shell
pnpm web:build
```

> **仅提供前端界面。** 发布包不捆绑或分发 Mihomo 等代理内核，用户需要自行准备兼容的内核或在内核中配置下载。本项目不提供代理节点或网络服务。

## 致谢

ClashMorden 基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 和 [Clash Verge Self](https://github.com/oomeow/clash-verge-self) 开发。界面也参考了 [YACD](https://github.com/MetaCubeX/Yacd-meta)、[Zashboard](https://github.com/Zephyruso/zashboard) 以及其他代理软件的设计。项目使用了 [Mihomo](https://github.com/MetaCubeX/mihomo)、[Tauri](https://github.com/tauri-apps/tauri)、[React](https://github.com/facebook/react)、[Vite](https://github.com/vitejs/vite) 和 [Material UI](https://github.com/mui/material-ui) 等开源技术。详情请查看上游项目及[许可证](./LICENSE)。

## 许可证

[GPL-3.0](./LICENSE)。基于本项目进行再发布时，也需遵守所包含上游组件的许可证和声明要求。

> **仅提供前端界面。** 发布包不捆绑或分发 Mihomo 等代理内核，用户需要自行准备兼容的内核或在内核中配置下载。本项目不提供代理节点或网络服务。
