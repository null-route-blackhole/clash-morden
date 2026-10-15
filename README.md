# ClashMorden

[简体中文](README.zh-CN.md) | English

<p align="center">
  <img src="./docs/assets/dock.png" alt="ClashMorden" width="220" />
</p>

<p align="center"><strong>A redesigned desktop UI for managing Mihomo.</strong></p>

ClashMorden is a community-developed interface based on Clash Verge Rev. It keeps the familiar proxy-client workflows and adds a redesigned overview, richer connection insights, and a refreshed visual theme.

> **Frontend interface only.** Release packages do not bundle or distribute Mihomo or any other proxy core. Users must provide a compatible core separately. ClashMorden does not provide proxy nodes or network services. This project will be no more updates.

## What is new

- **Redesigned overview:** Arrange dashboard panels around the information you care about, including traffic, latency, connection activity, rules, domains, and proxy nodes.
- **Connection topology:** Explore active connections and their proxy chains through a visual topology view.
- **Traffic and destination insights:** Review connection history and aggregate traffic by destination, process, rule, and proxy node.
- **Network maps:** Inspect destination locations on a map or globe, with switchable 2D and 3D views.
- **A refreshed theme system:** Updated spacing, typography, colors, and component styling, with six built-in themes, light and dark modes, and adjustable theme colors.
- **Organized configuration tools:** Manage profiles, proxy groups, rules, connections, and core settings from dedicated views.
- **Profile enhancement scripts:** Apply JavaScript enhancement scripts in the profile processing chain when profiles are activated or re-enhanced, allowing profile configuration to be adjusted automatically.
- **Application plugin scripts:** Create or import JavaScript scripts that run across the app's web interface. Scripts can add styles, respond to page navigation, and use persistent script storage; remote scripts can be updated from their source URL.

Only install enhancement or plugin scripts from sources you trust. Scripts may read or modify profile configuration or interact with the application interface. Review local scripts and remote subscription sources before enabling them.

## Preview

<p align="center">
  <img src="./docs/assets/Preview1.png" alt="ClashMorden overview" width="900" />
</p>

<p align="center">
  <img src="./docs/assets/Preview2.png" alt="ClashMorden configuration and scripts" width="900" />
</p>

## Development

The desktop interface uses Tauri. To run it locally, install Node.js, pnpm, Rust, and the platform dependencies required by Tauri:

```shell
pnpm install
pnpm dev
```

To build the frontend assets only:

```shell
pnpm web:build
```

The application communicates with a separately supplied Mihomo core. Building or publishing ClashMorden does not include the core in the release package.

## Credits

ClashMorden builds on [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) and [Clash Verge Self](https://github.com/oomeow/clash-verge-self). Its interface also references [YACD](https://github.com/MetaCubeX/Yacd-meta) and [Zashboard](https://github.com/Zephyruso/zashboard), along with ideas from other proxy clients. The project uses open-source technologies including [Mihomo](https://github.com/MetaCubeX/mihomo), [Tauri](https://github.com/tauri-apps/tauri), [React](https://github.com/facebook/react), [Vite](https://github.com/vitejs/vite), and [Material UI](https://github.com/mui/material-ui). See the upstream projects and the [license](./LICENSE) for details.

## License

[GPL-3.0](./LICENSE). Derivative distributions must also follow the licenses and notice requirements of their included upstream components.

> **Frontend interface only.** Release packages do not bundle or distribute Mihomo or any other proxy core. Users must provide a compatible core themselves or configure its download in the core settings. ClashMorden does not provide proxy nodes or network services.
