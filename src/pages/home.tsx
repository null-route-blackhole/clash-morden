import { PointerActivationConstraints } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  Button,
  Grid,
  Menu,
  MenuItem,
  Skeleton,
  Typography,
} from "@mui/material";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { BaseErrorBoundary, SortableItem } from "@/components/base";
import { AggregateConnectionStatsCard } from "@/components/home/aggregate-connection-stats-card";
import { ConnectionStatsCard } from "@/components/home/connection-stats-card";
import { CurrentProxyCard } from "@/components/home/current-proxy-card";
import { EnhancedTrafficStats } from "@/components/home/enhanced-traffic-stats";
import { HomeProfileCard } from "@/components/home/home-profile-card";
import { OverviewMemoryBoundary } from "@/components/home/overview-memory-monitor";
import { OverviewTopbar } from "@/components/layout/overview-topbar";
import { useKernelAlive } from "@/hooks/use-kernel-alive";
import { useMihomoCoresInfo } from "@/hooks/use-mihomo-cores-info";
import { useVergeStore } from "@/stores";

const preloadGlobeCard = () =>
  import("@/components/home/earth-globe-card").then((module) => ({
    default: module.EarthGlobeCard,
  }));
const preloadTopologyCard = () =>
  import("@/components/home/topology-card").then((module) => ({
    default: module.TopologyCard,
  }));
const preloadTestCard = () =>
  import("@/components/home/test-card").then((module) => ({
    default: module.TestCard,
  }));
const preloadClashInfoCard = () =>
  import("@/components/home/clash-info-card").then((module) => ({
    default: module.ClashInfoCard,
  }));
const preloadIpInfoCard = () =>
  import("@/components/home/ip-info-card").then((module) => ({
    default: module.IpInfoCard,
  }));
const preloadSystemInfoCard = () =>
  import("@/components/home/system-info-card").then((module) => ({
    default: module.SystemInfoCard,
  }));
const LazyGlobeCard = lazy(preloadGlobeCard);
const LazyTopologyCard = lazy(preloadTopologyCard);
const LazyTestCard = lazy(preloadTestCard);
const LazyClashInfoCard = lazy(preloadClashInfoCard);
const LazyIpInfoCard = lazy(preloadIpInfoCard);
const LazySystemInfoCard = lazy(preloadSystemInfoCard);

// 启动阶段预热可选卡片的 import，不阻塞首屏渲染（地球卡不预热，避免 three.js 进启动 chunk）
export const preloadHomePageCards = () =>
  Promise.all([
    preloadTestCard().catch(() => {}),
    preloadClashInfoCard().catch(() => {}),
    preloadIpInfoCard().catch(() => {}),
    preloadSystemInfoCard().catch(() => {}),
    preloadTopologyCard().catch(() => {}),
  ]);

// 首页卡片设置接口
interface HomeCardsSettings {
  profile: boolean;
  proxy: boolean;
  traffic: boolean;
  globe: boolean;
  topology: boolean;
  legacyTopology: boolean;
  connectionStats: boolean;
  aggregateStats: boolean;
  clashinfo: boolean;
  systeminfo: boolean;
  test: boolean;
  ip: boolean;
  [key: string]: boolean;
}

// 订阅卡/当前代理卡默认隐藏，可在编辑态的「添加模块」里打开
const DEFAULT_HOME_CARDS: HomeCardsSettings = {
  profile: false,
  proxy: false,
  traffic: true,
  globe: true,
  topology: true,
  legacyTopology: false,
  connectionStats: true,
  aggregateStats: true,
  clashinfo: false,
  systeminfo: false,
  test: true,
  ip: true,
};

// 默认顺序（新用户/缺省时）
const DEFAULT_CARD_ORDER = [
  "traffic",
  "test",
  "ip",
  "globe",
  "connectionStats",
  "aggregateStats",
  "topology",
  "legacyTopology",
  "clashinfo",
  "systeminfo",
  "profile",
  "proxy",
];

const CARD_LABEL_KEYS: Record<string, string> = {
  proxy: "currentProxy",
  test: "tests",
  clashinfo: "clashInfo",
  systeminfo: "systemInfo",
  aggregateStats: "aggregateStats",
};

// 卡片网格尺寸
const CARD_SIZES: Record<string, number> = {
  traffic: 12,
  globe: 12,
  topology: 12,
  legacyTopology: 12,
  connectionStats: 12,
  aggregateStats: 12,
  ip: 6,
  test: 6,
  clashinfo: 6,
  systeminfo: 6,
  profile: 6,
  proxy: 6,
};

// 老版本持久化的 home_cards 缺新键时补默认值、废弃键剔除（否则出现空卡片残留）
const normalizeHomeCards = (
  cards?: Record<string, boolean | undefined>,
): HomeCardsSettings => {
  const merged = { ...DEFAULT_HOME_CARDS } as HomeCardsSettings;
  for (const key of DEFAULT_CARD_ORDER) {
    if (typeof cards?.[key] === "boolean") merged[key] = cards[key];
  }
  return merged;
};

const HomePage = () => {
  const { t } = useTranslation();
  const { alive, coreBusy, toggleCore } = useKernelAlive();
  const { mihomoCoresInfo, isLoading: coreStatusLoading } =
    useMihomoCoresInfo();
  const coreInstalled = mihomoCoresInfo.some((core) => core.version);

  const homeCards = normalizeHomeCards(
    useVergeStore((s) => s.verge.home_cards) as HomeCardsSettings | undefined,
  );
  const savedOrder = useVergeStore((s) => s.verge.home_cards_order);
  const patchVerge = useVergeStore((s) => s.patchVerge);

  // 渲染顺序：持久化顺序优先，缺失的键兜底按默认顺序补。
  // 注意去重：老版本 bug 可能在 home_cards_order 里写入重复 key，
  // 重复 key 会破坏 React 调和（表现为卡片复制/三张并排/残留边框）
  const order = useMemo(() => {
    // 白名单过滤：剔除旧版本遗留的已废弃 key
    const known = DEFAULT_CARD_ORDER;
    const base =
      savedOrder && savedOrder.length > 0
        ? [...new Set(savedOrder)].filter((key) => known.includes(key))
        : DEFAULT_CARD_ORDER;
    const missing = known.filter((key) => !base.includes(key));
    return [...base, ...missing];
  }, [savedOrder]);

  const [editing, setEditing] = useState(false);
  const [editEpoch, setEditEpoch] = useState(0);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

  // ESC 退出编辑态
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing]);

  const renderCardContent = (key: string) => {
    switch (key) {
      case "traffic":
        return <EnhancedTrafficStats />;
      case "globe":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={384} />}>
            <LazyGlobeCard />
          </Suspense>
        );
      case "topology":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={400} />}>
            <LazyTopologyCard />
          </Suspense>
        );
      case "legacyTopology":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={400} />}>
            <LazyTopologyCard view="legacy" />
          </Suspense>
        );
      case "ip":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
            <LazyIpInfoCard />
          </Suspense>
        );
      case "test":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
            <LazyTestCard />
          </Suspense>
        );
      case "clashinfo":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
            <LazyClashInfoCard />
          </Suspense>
        );
      case "systeminfo":
        return (
          <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
            <LazySystemInfoCard />
          </Suspense>
        );
      case "connectionStats":
        return <ConnectionStatsCard />;
      case "aggregateStats":
        return <AggregateConnectionStatsCard />;
      case "profile":
        return <HomeProfileCard />;
      case "proxy":
        return <CurrentProxyCard />;
      default:
        return null;
    }
  };

  const visibleKeys = order.filter((key) => homeCards[key]);
  const hiddenKeys = DEFAULT_CARD_ORDER.filter((key) => !homeCards[key]);

  // 行式打包：12 列卡独占一行，6 列卡两两成行 —— 拖动换序后间距依然均匀
  const packedRows = useMemo(() => {
    const rows: string[][] = [];
    let pending: string[] = [];
    const flush = () => {
      if (pending.length > 0) {
        rows.push(pending);
        pending = [];
      }
    };
    for (const key of visibleKeys) {
      if ((CARD_SIZES[key] ?? 6) === 12) {
        flush();
        rows.push([key]);
      } else {
        pending.push(key);
        if (pending.length === 2) flush();
      }
    }
    flush();
    return rows;
  }, [visibleKeys]);

  const handleAddCard = useCallback(
    async (key: string) => {
      setAddAnchor(null);
      await patchVerge({
        home_cards: { ...homeCards, [key]: true },
        home_cards_order: [...order.filter((k) => k !== key), key],
      });
    },
    [homeCards, order, patchVerge],
  );

  const handleRemoveCard = useCallback(
    async (key: string) => {
      await patchVerge({ home_cards: { ...homeCards, [key]: false } });
    },
    [homeCards, patchVerge],
  );

  return (
    <BaseErrorBoundary>
      <div className="flex h-full min-h-0 w-full flex-col">
        <OverviewTopbar
          editing={editing}
          onEdit={() => {
            setEditing((current) => !current);
            setEditEpoch((epoch) => epoch + 1);
          }}
          coreRunning={alive}
          coreInstalled={coreInstalled}
          coreStatusLoading={coreStatusLoading}
          coreBusy={coreBusy}
          onToggleCore={() => void toggleCore()}
        />

        <div className="bg-background-default min-h-0 flex-1 overflow-auto py-2 pr-1 pl-2">
          {/* 编辑态工具栏：完成 + 添加模块（点击顶栏铅笔进入编辑态） */}
          {editing && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1,
                px: 0.5,
              }}>
              <Typography variant="body2" color="text.secondary">
                {t("pages.home.edit.hint")}
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={(event) => setAddAnchor(event.currentTarget)}>
                  {t("pages.home.edit.addCard")}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckRoundedIcon />}
                  onClick={() => {
                    setEditing(false);
                    // 重挂载网格，清除 dnd-kit 拖拽过渡/残留样式
                    setEditEpoch((epoch) => epoch + 1);
                  }}>
                  {t("pages.home.edit.done")}
                </Button>
              </Box>
              <Menu
                anchorEl={addAnchor}
                open={!!addAnchor}
                onClose={() => setAddAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
                {hiddenKeys.length === 0 ? (
                  <MenuItem disabled>
                    {t("pages.home.edit.allVisible")}
                  </MenuItem>
                ) : (
                  hiddenKeys.map((key) => (
                    <MenuItem key={key} onClick={() => void handleAddCard(key)}>
                      {t(
                        `pages.home.settings.cards.${CARD_LABEL_KEYS[key] ?? key}`,
                      )}
                    </MenuItem>
                  ))
                )}
              </Menu>
            </Box>
          )}

          <DragDropProvider
            sensors={(defaults) => [
              ...defaults,
              PointerSensor.configure({
                activationConstraints: [
                  new PointerActivationConstraints.Distance({ value: 8 }),
                ],
              }),
            ]}
            onDragEnd={async (event) => {
              const next = move(visibleKeys, event);
              if (next !== visibleKeys) {
                // 未显示的卡片保持在末尾
                const full = [
                  ...new Set([
                    ...next,
                    ...DEFAULT_CARD_ORDER.filter((key) => !next.includes(key)),
                  ]),
                ];
                await patchVerge({ home_cards_order: full });
              }
            }}>
            <Box
              key={`cards-${editEpoch}`}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {packedRows.map((row) => (
                <Grid
                  key={row.join("|")}
                  container
                  spacing={2}
                  columns={{ xs: 12, sm: 12, md: 12 }}>
                  {row.map((key) => {
                    const index = visibleKeys.indexOf(key);
                    return (
                      <Grid
                        key={key}
                        // Full-width cards always span the complete overview row.
                        // Smaller cards remain two-column cards when paired.
                        size={{
                          xs: 12,
                          sm: row.length === 1 ? 12 : 6,
                          md: row.length === 1 ? 12 : 6,
                        }}
                        sx={{ display: "flex" }}>
                        <SortableItem
                          id={key}
                          index={index}
                          disabled={!editing}
                          style={{ width: "100%" }}>
                          <Box
                            sx={{
                              height: "100%",
                              position: "relative",
                              outline: editing ? "1.5px dashed" : "none",
                              outlineColor: editing
                                ? "primary.main"
                                : undefined,
                              borderRadius: 2,
                              transition: "outline-color .2s",
                            }}>
                            <Box sx={{ height: "100%" }}>
                              <OverviewMemoryBoundary name={`overview:${key}`}>
                                {renderCardContent(key)}
                              </OverviewMemoryBoundary>
                            </Box>
                            {editing && (
                              <Button
                                size="small"
                                onClick={() => void handleRemoveCard(key)}
                                title={t("pages.home.edit.remove")}
                                sx={{
                                  position: "absolute",
                                  top: 6,
                                  right: 6,
                                  zIndex: 3,
                                  minWidth: 0,
                                  width: 26,
                                  height: 26,
                                  p: 0,
                                  borderRadius: "50%",
                                  bgcolor: "background.paper",
                                  boxShadow: 2,
                                  lineHeight: 1,
                                }}>
                                <CloseRoundedIcon sx={{ fontSize: 16 }} />
                              </Button>
                            )}
                          </Box>
                        </SortableItem>
                      </Grid>
                    );
                  })}
                </Grid>
              ))}
            </Box>
          </DragDropProvider>
        </div>
      </div>
    </BaseErrorBoundary>
  );
};

export default HomePage;
