import "@/components/style-test/style-test.css";

import { useTheme } from "@mui/material";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Layers,
  Lock,
  Maximize2,
  Minus,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  Settings2,
  Shield,
  Table2,
  Unlock,
  Wifi,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";

import { BasePage } from "@/components/base";
import { flowColor } from "@/components/home/topology/flow-colors";

const designs = [
  {
    id: "01",
    name: "极简描边",
    detail: "清晰边界 · 中性灰 · 轻量层级",
    kind: "outline",
  },
  {
    id: "02",
    name: "柔和层次",
    detail: "柔和底色 · 圆润控件 · 安静留白",
    kind: "soft",
  },
  {
    id: "04",
    name: "通透玻璃",
    detail: "半透明表面 · 细腻光感 · 轻盈空间",
    kind: "glass",
  },
  {
    id: "08",
    name: "鲜明结构",
    detail: "明确轮廓 · 高对比 · 克制色彩",
    kind: "bold",
  },
] as const;

function IconControl({
  label,
  children,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ds-icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}>
      {children}
    </button>
  );
}
function Segment({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="ds-segment" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={value === option}
          onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </fieldset>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="ds-toggle-label">
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        className="ds-toggle"
        onClick={() => onChange(!value)}>
        <span />
      </button>
      {label}
    </label>
  );
}
function Pick({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ds-pick">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
function Legend({ items }: { items: { label: string; tone: string }[] }) {
  return (
    <div className="ds-legend">
      {items.map(({ label, tone }) => (
        <span key={label}>
          <i className={`tone-${tone}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
function Panel({
  title,
  icon,
  tools,
  children,
  wide,
  onIconClick,
  iconLabel,
}: {
  title: string;
  icon: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  onIconClick?: () => void;
  iconLabel?: string;
}) {
  return (
    <section className={`ds-panel ${wide ? "ds-wide" : ""}`}>
      <header>
        <div className="ds-panel-title">
          {onIconClick ? (
            <IconControl label={iconLabel ?? title} onClick={onIconClick}>
              {icon}
            </IconControl>
          ) : (
            <span className="ds-title-icon">{icon}</span>
          )}
          <h2>{title}</h2>
        </div>
        <div className="ds-tools">{tools}</div>
      </header>
      <div className="ds-panel-content">{children}</div>
    </section>
  );
}

export default function StyleTestPage() {
  const theme = useTheme();
  const [design, setDesign] = useState("02");
  const [dark, setDark] = useState(theme.palette.mode === "dark");
  const [compact, setCompact] = useState(false);
  const [mode, setMode] = useState("规则");
  const [running, setRunning] = useState(true);
  const [systemProxy, setSystemProxy] = useState(true);
  const [tun, setTun] = useState(false);
  const [editing, setEditing] = useState(false);
  const [added, setAdded] = useState(false);
  const [hiddenIp, setHiddenIp] = useState(true);
  const [group, setGroup] = useState("自动选择");
  const [proxy, setProxy] = useState("香港 · 01");
  const [profile, setProfile] = useState("主订阅");
  const [filter, setFilter] = useState("");
  const [dimension, setDimension] = useState("域名");
  const [sort, setSort] = useState("连接数");
  const [view, setView] = useState("chart");
  const [projection, setProjection] = useState("3D");
  const [mapStyle, setMapStyle] = useState("卫星");
  const [locked, setLocked] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [fullMap, setFullMap] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [paused, setPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [destination, setDestination] = useState(true);
  const [source, setSource] = useState("源 IP");
  const [primary, setPrimary] = useState("IPIP");
  const [secondary, setSecondary] = useState("IP.SB");
  const [sample, setSample] = useState(0);
  const [notice, setNotice] = useState(
    "所有操作仅用于预览，不会改变真实网络设置。",
  );
  const [legendStyle, setLegendStyle] = useState("圆点");
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const selected = designs.find((item) => item.id === design)!;
  const test = () => {
    setSample((previous) => previous + 1);
    setNotice("示例测速已更新。实际延迟测试卡也使用左上角图标触发测速。");
  };
  const stats = ["google.com", "github.com", "api.example.com"].map(
    (name, i) => ({
      name:
        dimension === "进程"
          ? ["Safari", "Terminal", "Music"][i]
          : dimension === "代理节点"
            ? ["香港 · 01", "日本 · 02", "DIRECT"][i]
            : name,
      value: sort === "连接数" ? [128, 72, 24][i] : [84, 46, 12][i],
    }),
  );
  return (
    <BasePage title="Test" full>
      <div
        className={`ds-lab ds-${selected.kind} ${dark ? "ds-dark" : ""} ${compact ? "ds-compact" : ""} ${legendStyle === "线段" ? "ds-line-legends" : ""}`}>
        <div className="ds-intro">
          <div>
            <span className="ds-eyebrow">OVERVIEW / DESIGN STUDY 02</span>
            <h1>少一点装饰，多一点秩序。</h1>
            <p>
              以完整概览比较 4
              套界面语言。中性图标，克制状态色，统一的控件尺度。
            </p>
          </div>
          <div className="ds-preview-tools">
            <Toggle label="深色" value={dark} onChange={setDark} />
            <Toggle label="紧凑" value={compact} onChange={setCompact} />
          </div>
        </div>
        <div className="ds-designs">
          {designs.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={design === item.id}
              onClick={() => setDesign(item.id)}>
              <span>{item.id}</span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </div>
              {design === item.id && <Check size={15} />}
            </button>
          ))}
        </div>
        <div className="ds-workspace">
          <div className="ds-overview-header">
            <div>
              <h2>概览</h2>
              <span className="ds-subtitle">
                <i className={running ? "tone-green" : "tone-gray"} />
                {running ? "内核运行中" : "内核已停止"} · Mihomo Alpha
              </span>
            </div>
            <div className="ds-tools">
              <Segment
                label="代理模式"
                options={["规则", "全局", "直连"]}
                value={mode}
                onChange={setMode}
              />
              <IconControl
                label={running ? "停止内核" : "启动内核"}
                active={running}
                onClick={() => setRunning(!running)}>
                <Power />
              </IconControl>
              <IconControl
                label="重启内核"
                onClick={() => {
                  setRunning(true);
                  setNotice("内核重启演示完成");
                }}>
                <RefreshCw />
              </IconControl>
              <IconControl
                label="编辑概览"
                active={editing}
                onClick={() => setEditing(!editing)}>
                <Pencil />
              </IconControl>
            </div>
          </div>
          <div className="ds-status-row">
            <Toggle
              label="系统代理"
              value={systemProxy}
              onChange={setSystemProxy}
            />
            <Toggle label="TUN 模式" value={tun} onChange={setTun} />
            <span className="ds-spacer" />
            <span className="ds-muted">图例形式</span>
            <Pick
              label="图例形式"
              options={["圆点", "线段"]}
              value={legendStyle}
              onChange={setLegendStyle}
            />
          </div>
          {editing && (
            <div className="ds-edit-strip">
              <span>
                <GripVertical size={15} />
                模块编辑预览
              </span>
              <div className="ds-tools">
                <button
                  type="button"
                  className="ds-button"
                  onClick={() => setAdded(true)}
                  disabled={added}>
                  <Plus />
                  添加模块
                </button>
                <button
                  type="button"
                  className="ds-button ds-primary"
                  onClick={() => setEditing(false)}>
                  <Check />
                  完成
                </button>
              </div>
            </div>
          )}
          <div className="ds-grid">
            <div className="ds-metrics ds-wide">
              {[
                {
                  name: "上传速度",
                  value: "128",
                  unit: "KB/s",
                  icon: <ArrowUp />,
                },
                {
                  name: "下载速度",
                  value: "8.42",
                  unit: "MB/s",
                  icon: <ArrowDown />,
                },
                { name: "活跃连接", value: "224", unit: "", icon: <Network /> },
                { name: "已关闭", value: "1,208", unit: "", icon: <Layers /> },
                {
                  name: "总上传量",
                  value: "2.16",
                  unit: "GB",
                  icon: <ArrowUp />,
                },
                {
                  name: "总下载量",
                  value: "18.4",
                  unit: "GB",
                  icon: <ArrowDown />,
                },
              ].map((item) => (
                <div key={item.name}>
                  <span className="ds-metric-name">
                    {item.icon}
                    {item.name}
                  </span>
                  <strong>
                    {item.value}
                    <small>{item.unit}</small>
                  </strong>
                </div>
              ))}
            </div>
            <Panel
              title="延迟测试"
              icon={<Activity />}
              iconLabel="全部测速"
              onIconClick={test}
              tools={
                <Legend
                  items={[
                    { label: "Max", tone: "red" },
                    { label: "Min", tone: "green" },
                    { label: "Avg", tone: "blue" },
                  ]}
                />
              }>
              {["Apple", "GitHub", "Google"].map((name, i) => (
                <button
                  type="button"
                  className="ds-speed-row"
                  key={name}
                  onClick={test}
                  title={`重新测试 ${name}`}>
                  <span>{name}</span>
                  <span className="ds-bar">
                    <i
                      style={{ width: `${30 + i * 16 + (sample % 4) * 3}%` }}
                    />
                  </span>
                  <span className="ds-good">{42 + i * 36 + (sample % 11)}</span>
                  <span className="ds-red">{210 + i * 42}</span>
                  <span className="ds-good">{21 + i * 8}</span>
                  <span className="ds-blue">{78 + i * 14}</span>
                </button>
              ))}
            </Panel>
            <Panel
              title="网络信息"
              icon={<Globe />}
              tools={
                <>
                  <Legend
                    items={[
                      { label: primary, tone: "blue" },
                      { label: secondary, tone: "orange" },
                    ]}
                  />
                  <IconControl
                    label="切换 IP 可见性"
                    active={!hiddenIp}
                    onClick={() => setHiddenIp(!hiddenIp)}>
                    {hiddenIp ? <EyeOff /> : <Eye />}
                  </IconControl>
                  <IconControl
                    label="刷新网络信息"
                    onClick={() => setNotice("网络信息已刷新（示例数据）")}>
                    <RefreshCw />
                  </IconControl>
                </>
              }>
              {[
                {
                  service: primary,
                  set: setPrimary,
                  place: "中国 · 上海",
                  ip: "203.0.113.24",
                  tone: "blue",
                },
                {
                  service: secondary,
                  set: setSecondary,
                  place: "中国 · 香港",
                  ip: "198.51.100.8",
                  tone: "orange",
                },
              ].map((item, i) => (
                <div className="ds-network-row" key={i}>
                  <i className={`tone-${item.tone}`} />
                  <div>
                    <strong>{item.place}</strong>
                    <small>{hiddenIp ? "***.***.***.***" : item.ip}</small>
                  </div>
                  <Pick
                    label={`查询服务 ${i + 1}`}
                    options={["IPIP", "IP.SB", "IPWHOIS"]}
                    value={item.service}
                    onChange={item.set}
                  />
                </div>
              ))}
            </Panel>
            <Panel
              title="当前代理"
              icon={<Shield />}
              tools={
                <>
                  <span className="ds-chip">{mode}</span>
                  <IconControl
                    label="代理测速"
                    onClick={() => setNotice("节点延迟已更新（示例）")}>
                    <Activity />
                  </IconControl>
                </>
              }>
              <label className="ds-search">
                <Search />
                <input
                  placeholder="搜索节点"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
              <div className="ds-field">
                <span>代理组</span>
                <Pick
                  label="代理组"
                  options={["自动选择", "海外服务", "媒体服务"]}
                  value={group}
                  onChange={setGroup}
                />
              </div>
              <div className="ds-field">
                <span>出口代理</span>
                <Pick
                  label="出口代理"
                  options={Array.from(
                    new Set([
                      proxy,
                      ...["香港 · 01", "日本 · 02", "新加坡 · 03"].filter(
                        (name) => name.includes(filter),
                      ),
                    ]),
                  )}
                  value={proxy}
                  onChange={setProxy}
                />
              </div>
              <div className="ds-tags">
                <span className="ds-chip">Shadowsocks</span>
                <span className="ds-chip">UDP</span>
                <span className="ds-chip">TCP</span>
                <span className="ds-good">42 ms</span>
              </div>
            </Panel>
            <Panel
              title="订阅与运行环境"
              icon={<Server />}
              tools={
                <IconControl
                  label="更新订阅"
                  onClick={() => setNotice("订阅已更新（示例）")}>
                  <RefreshCw />
                </IconControl>
              }>
              <div className="ds-field">
                <span>当前订阅</span>
                <Pick
                  label="订阅"
                  options={["主订阅", "备用订阅", "本地配置"]}
                  value={profile}
                  onChange={setProfile}
                />
              </div>
              <div className="ds-field">
                <span>可用流量</span>
                <strong>81.6 / 100 GB</strong>
              </div>
              <div className="ds-bar">
                <i style={{ width: "81.6%" }} />
              </div>
              <div className="ds-field">
                <span>内存占用</span>
                <strong>84.2 MB</strong>
                <IconControl
                  label="复制环境信息"
                  onClick={() => setNotice("复制交互演示完成；未修改剪贴板")}>
                  <Copy />
                </IconControl>
              </div>
              <div className="ds-tools">
                <button
                  type="button"
                  className="ds-button"
                  onClick={() => setNotice("查看配置交互演示")}>
                  <Settings2 />
                  查看配置
                </button>
                <button type="button" className="ds-button" disabled>
                  更新中
                </button>
                <button
                  type="button"
                  className="ds-button ds-danger"
                  onClick={() => setNotice("断开连接交互演示")}>
                  断开连接
                </button>
              </div>
            </Panel>
            <Panel
              title="连接地图"
              icon={<Globe />}
              wide
              tools={
                <>
                  <Legend
                    items={[
                      { label: "本机", tone: "gray" },
                      { label: "代理", tone: "blue" },
                      { label: "直连", tone: "orange" },
                    ]}
                  />
                  <Segment
                    label="投影"
                    options={["3D", "2D"]}
                    value={projection}
                    onChange={setProjection}
                  />
                  <Segment
                    label="底图"
                    options={["卫星", "简洁"]}
                    value={mapStyle}
                    onChange={setMapStyle}
                  />
                  <IconControl
                    label="锁定缩放"
                    active={locked}
                    onClick={() => setLocked(!locked)}>
                    {locked ? <Lock /> : <Unlock />}
                  </IconControl>
                  <IconControl
                    label="自动旋转"
                    active={rotating}
                    onClick={() => setRotating(!rotating)}>
                    <RotateCw />
                  </IconControl>
                  <IconControl
                    label="展开地图"
                    active={fullMap}
                    onClick={() => setFullMap(!fullMap)}>
                    <Maximize2 />
                  </IconControl>
                </>
              }>
              <div
                className={`ds-map ${fullMap ? "expanded" : ""} ${mapStyle === "卫星" ? "satellite" : ""}`}>
                <div
                  className={`ds-globe ${projection === "2D" ? "flat" : ""} ${rotating ? "rotating" : ""}`}
                  style={{
                    width: 145 * zoom,
                    height: (projection === "2D" ? 85 : 145) * zoom,
                  }}>
                  <Globe strokeWidth={0.7} />
                  <span className="ds-map-dot" />
                </div>
                <span className="ds-map-caption">
                  {projection} · {mapStyle} · 连接路径预览
                </span>
                <div className="ds-map-zoom">
                  <IconControl
                    label="放大地图"
                    disabled={locked || zoom >= 1.4}
                    onClick={() => setZoom(Math.min(1.4, zoom + 0.1))}>
                    <Plus />
                  </IconControl>
                  <IconControl
                    label="缩小地图"
                    disabled={locked || zoom <= 0.7}
                    onClick={() => setZoom(Math.max(0.7, zoom - 0.1))}>
                    <Minus />
                  </IconControl>
                </div>
              </div>
            </Panel>
            <Panel
              title="连接拓扑"
              icon={<Network />}
              wide
              tools={
                <>
                  <Pick
                    label="拓扑来源"
                    options={["源 IP", "进程名"]}
                    value={source}
                    onChange={setSource}
                  />
                  <Toggle
                    label="折叠代理组"
                    value={collapsed}
                    onChange={setCollapsed}
                  />
                  <Toggle
                    label="目标地址"
                    value={destination}
                    onChange={setDestination}
                  />
                  <IconControl
                    label={paused ? "继续拓扑" : "暂停拓扑"}
                    active={paused}
                    onClick={() => setPaused(!paused)}>
                    {paused ? <Play /> : <Pause />}
                  </IconControl>
                </>
              }>
              <div
                className="ds-topology"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    x: event.clientX,
                    y: event.clientY,
                    left: event.currentTarget.scrollLeft,
                    top: event.currentTarget.scrollTop,
                  };
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  event.currentTarget.scrollLeft =
                    drag.current.left - event.clientX + drag.current.x;
                  event.currentTarget.scrollTop =
                    drag.current.top - event.clientY + drag.current.y;
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onLostPointerCapture={() => {
                  drag.current = null;
                }}>
                <div>
                  {[
                    source === "源 IP" ? "192.168.1.10" : "Safari",
                    "海外服务规则",
                    ...(!collapsed ? ["规则分流"] : []),
                    group,
                    proxy,
                    ...(destination ? ["google.com:443"] : []),
                  ].map((name, i) => (
                    <span
                      key={`${i}-${name}`}
                      className="ds-flow-node"
                      style={
                        {
                          "--node-color": flowColor(
                            i < 2
                              ? i
                              : i === (collapsed ? 3 : 4)
                                ? 3
                                : i === (collapsed ? 4 : 5)
                                  ? 4
                                  : 2,
                            dark,
                          ),
                        } as CSSProperties
                      }
                      title={name}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <small className="ds-muted">
                {paused ? "已暂停" : "实时连接"} · 可拖动平移，悬停查看完整名称
              </small>
            </Panel>
            <Panel
              title="连接统计"
              icon={<BarChart3 />}
              wide
              tools={
                <>
                  <Pick
                    label="统计维度"
                    options={["域名", "进程", "代理节点"]}
                    value={dimension}
                    onChange={setDimension}
                  />
                  <Pick
                    label="排序依据"
                    options={["连接数", "流量"]}
                    value={sort}
                    onChange={setSort}
                  />
                  <div className="ds-icon-group">
                    <IconControl
                      label="图形视图"
                      active={view === "chart"}
                      onClick={() => setView("chart")}>
                      <BarChart3 />
                    </IconControl>
                    <IconControl
                      label="表格视图"
                      active={view === "table"}
                      onClick={() => setView("table")}>
                      <Table2 />
                    </IconControl>
                  </div>
                </>
              }>
              {view === "table" ? (
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>{dimension}</th>
                      <th>{sort}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>
                          {row.value}
                          {sort === "流量" ? " MB" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                stats.map((row) => (
                  <div className="ds-stat-row" key={row.name}>
                    <span>{row.name}</span>
                    <div className="ds-bar">
                      <i
                        style={{
                          width: `${row.value / (sort === "连接数" ? 1.4 : 1)}%`,
                        }}
                      />
                    </div>
                    <strong>{row.value}</strong>
                  </div>
                ))
              )}
            </Panel>
            {added && (
              <Panel
                title="新增模块"
                icon={<Layers />}
                tools={
                  <IconControl label="移除模块" onClick={() => setAdded(false)}>
                    <X />
                  </IconControl>
                }>
                <p className="ds-muted">模块添加、移除与空状态预览。</p>
              </Panel>
            )}
          </div>
          <div className="ds-notice" role="status">
            <Wifi size={14} />
            {notice}
          </div>
        </div>
        <footer className="ds-bottom">
          <span>
            当前方案{" "}
            <strong>
              {design} · {selected.name}
            </strong>{" "}
            / {compact ? "紧凑" : "舒适"} / {dark ? "深色" : "浅色"}
          </span>
          <span>可分别选择模式切换、按钮、开关、选择框与图例。</span>
        </footer>
      </div>
    </BasePage>
  );
}
