import {
  Box,
  ButtonBase,
  Chip,
  ClickAwayListener,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  type PopperProps,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useLockFn } from "ahooks";
import { Search, Shield } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { ProxyInfo } from "tauri-plugin-mihomo-api";

import { AccessTimeRounded as AccessTimeRoundedIcon } from "@/components/base/interface-icons";
import { ArrowDropDown as ArrowDropDownIcon } from "@/components/base/interface-icons";
import { ChevronRight as ChevronRightIcon } from "@/components/base/interface-icons";
import { NetworkCheckRounded as NetworkCheckRoundedIcon } from "@/components/base/interface-icons";
import { SortByAlphaRounded as SortByAlphaRoundedIcon } from "@/components/base/interface-icons";
import { SortRounded as SortRoundedIcon } from "@/components/base/interface-icons";
import type { ProxySortType } from "@/components/proxy/use-filter-sort";
import type { IProxyGroupItem } from "@/components/proxy/use-render-list";
import { useClashInfo } from "@/hooks/use-clash";
import { useGroupDelayVersion } from "@/hooks/use-group-delays";
import { useProxySelection } from "@/hooks/use-proxy-selection";
import delayManager, { DEFAULT_LATENCY_TIMEOUT } from "@/services/delay";
import { mutate, swrKeys, useProxiesSWR } from "@/services/swr";
import {
  useProfilesStore,
  useProxyHeadStateStore,
  useVergeStore,
} from "@/stores";
import { compareByDelay, DEFAULT_DELAY_TIMEOUT } from "@/utils/delay";

import { EnhancedCard } from "./enhanced-card";
import { OverviewIcon } from "./overview-controls";

const STORAGE_KEY_GROUP = "clash-verge-selected-proxy-group";
const STORAGE_KEY_SORT_TYPE = "clash-verge-proxy-sort-type";

const PROXY_MENU_MAX_HEIGHT = 500;
const PROXY_MENU_VIEWPORT_MARGIN = 8;

const proxyMenuModifiers: PopperProps["modifiers"] = [
  {
    name: "menuSize",
    enabled: true,
    phase: "beforeRead",
    fn: ({ state }) => {
      const popper = state.elements.popper;
      const anchor = state.elements.reference.getBoundingClientRect();
      const viewportHeight = popper.ownerDocument.documentElement.clientHeight;
      // Use the larger side before flip runs so sizing cannot alternate with placement.
      const availableHeight =
        Math.max(anchor.top, viewportHeight - anchor.bottom) -
        PROXY_MENU_VIEWPORT_MARGIN;
      popper.style.width = `${anchor.width}px`;
      popper.style.setProperty(
        "--proxy-menu-max-height",
        `${Math.max(0, Math.min(PROXY_MENU_MAX_HEIGHT, availableHeight))}px`,
      );
      state.rects.popper.width = popper.offsetWidth;
      state.rects.popper.height = popper.offsetHeight;
    },
  },
  {
    name: "showMenu",
    enabled: true,
    phase: "beforeWrite",
    requires: ["computeStyles"],
    fn: ({ state }) => {
      state.styles.popper.visibility = "visible";
    },
  },
];

interface ProxyOption {
  memberIndex: number;
  member: ProxyInfo;
  value: string;
  name: string;
  disabled: boolean;
}

type OpenSelect = "group" | "proxy" | null;

// 与 delayManager.formatDelayColor 的阈值语义一致
function convertDelayColor(
  delayValue: number,
): "success" | "warning" | "error" | "default" {
  if (delayValue <= 0) return "error";
  if (delayValue < 500) return "success";
  if (delayValue < DEFAULT_LATENCY_TIMEOUT) return "warning";
  return "error";
}

const optionValue = (memberIndex: number, member: ProxyInfo) =>
  `${memberIndex}:${member.name}`;

const sortProxyOptions = (
  options: ProxyOption[],
  sortType: ProxySortType,
  delayOf: (member: ProxyInfo) => number,
  latencyTimeout?: number,
) => {
  if (sortType === 0) return options;
  if (sortType === 2) {
    return [...options].sort((a, b) => a.name.localeCompare(b.name));
  }

  const effectiveTimeout =
    typeof latencyTimeout === "number" && latencyTimeout > 0
      ? latencyTimeout
      : DEFAULT_DELAY_TIMEOUT;

  return options
    .map((option) => ({ option, delay: delayOf(option.member) }))
    .sort((a, b) => {
      const byDelay = compareByDelay(a.delay, b.delay, effectiveTimeout);
      return byDelay || a.option.name.localeCompare(b.option.name);
    })
    .map(({ option }) => option);
};

interface PersistentSelectProps {
  label: string;
  displayValue: React.ReactNode;
  open: boolean;
  disabled: boolean;
  keepOpenRef: React.RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  renderOptions: () => React.ReactNode;
}

const PersistentSelect = ({
  label,
  displayValue,
  open,
  disabled,
  keepOpenRef,
  onOpenChange,
  renderOptions,
}: PersistentSelectProps) => {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listboxId = `${id}-listbox`;
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const popperOptions = useMemo<PopperProps["popperOptions"]>(
    () => ({
      onFirstUpdate: () => {
        const list = listRef.current;
        const paper = list?.parentElement;
        const item =
          list?.querySelector<HTMLElement>(
            '[aria-selected="true"]:not([aria-disabled="true"])',
          ) ??
          list?.querySelector<HTMLElement>(
            '[role="option"]:not([aria-disabled="true"])',
          );
        if (!item || !paper) return;

        // Focusing before positioning can scroll the page instead of just the menu.
        item.focus({ preventScroll: true });
        paper.scrollTop +=
          item.getBoundingClientRect().top -
          paper.getBoundingClientRect().top -
          (paper.clientHeight - item.offsetHeight) / 2;
      },
    }),
    [],
  );

  useEffect(() => {
    if (!open) return;

    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        onOpenChange(false);
      } else if (event.key === "Escape") {
        onOpenChange(false);
        anchorRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", closeFromKeyboard);
    return () => document.removeEventListener("keydown", closeFromKeyboard);
  }, [onOpenChange, open]);

  return (
    <ClickAwayListener
      onClickAway={(event) => {
        if (!open) return;
        const target = event.target;
        if (target instanceof Node && keepOpenRef.current?.contains(target)) {
          return;
        }
        onOpenChange(false);
      }}>
      <Box>
        <Box className="ds-field">
          <span id={labelId}>{label}</span>
          <Box className="overview-proxy-select">
            <ButtonBase
              ref={anchorRef}
              type="button"
              role="combobox"
              aria-labelledby={`${labelId} ${valueId}`}
              aria-haspopup="listbox"
              aria-controls={open ? listboxId : undefined}
              aria-expanded={open}
              disabled={disabled}
              onClick={() => onOpenChange(!open)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  onOpenChange(true);
                }
              }}
              sx={{
                width: "100%",
                height: 40,
                px: 1.75,
                borderRadius: "inherit",
                justifyContent: "space-between",
                textAlign: "left",
                color: disabled ? "text.disabled" : "text.primary",
              }}>
              <Box id={valueId} sx={{ minWidth: 0, flex: 1 }}>
                {displayValue}
              </Box>
              <ArrowDropDownIcon
                sx={{
                  ml: 1,
                  color: disabled ? "action.disabled" : "action.active",
                  transform: open ? "rotate(180deg)" : undefined,
                }}
              />
            </ButtonBase>
          </Box>
        </Box>

        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          modifiers={proxyMenuModifiers}
          popperOptions={popperOptions}
          sx={{
            visibility: "hidden",
            zIndex: (theme) => theme.zIndex.modal,
          }}>
          <Paper
            elevation={8}
            sx={{
              maxHeight: `var(--proxy-menu-max-height, ${PROXY_MENU_MAX_HEIGHT}px)`,
              overflow: "auto",
            }}>
            <MenuList
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              variant="selectedMenu">
              {open && renderOptions()}
            </MenuList>
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
};

interface PersistentProxySelectProps extends Omit<
  PersistentSelectProps,
  "displayValue" | "renderOptions"
> {
  value: string;
  selectedName: string;
  groupName: string;
  fixed?: string;
  selectedDelay: number;
  options: ProxyOption[];
  onChange: (value: string) => void;
}

const PersistentProxySelect = ({
  groupName,
  fixed,
  selectedName,
  selectedDelay,
  options,
  value,
  onChange,
  ...props
}: PersistentProxySelectProps) => {
  const fixedProxyInUsed = selectedName === fixed;

  return (
    <PersistentSelect
      {...props}
      displayValue={
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
          <Typography noWrap>{selectedName}</Typography>
          <Chip
            size="small"
            label={delayManager.formatDelay(selectedDelay)}
            color={convertDelayColor(selectedDelay)}
          />
          {fixedProxyInUsed && (
            <span
              style={{
                position: "absolute",
                fontSize: "12px",
                top: "-3px",
                right: "25px",
              }}>
              📌
            </span>
          )}
        </Box>
      }
      renderOptions={() =>
        options.map((option) => {
          const selected = option.value === value;
          const isFixed = option.name === fixed;
          const delay = option.disabled
            ? -1
            : delayManager.getDelayFix(option.member, groupName);

          return (
            <MenuItem
              key={option.value}
              role="option"
              aria-selected={selected}
              selected={selected}
              disabled={option.disabled}
              onClick={() => {
                if (!option.disabled) onChange(option.value);
              }}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                pr: 1,
              }}>
              {isFixed && (
                <span
                  style={{
                    position: "absolute",
                    fontSize: "12px",
                    top: "-5px",
                    right: "5px",
                    ...(!fixedProxyInUsed && {
                      filter: "grayscale(1)",
                    }),
                  }}>
                  📌
                </span>
              )}
              <Typography noWrap sx={{ flex: 1, mr: 1 }}>
                {option.name}
              </Typography>
              {!option.disabled && (
                <Chip
                  size="small"
                  label={delayManager.formatDelay(delay)}
                  color={convertDelayColor(delay)}
                  sx={{
                    minWidth: "60px",
                    height: "22px",
                    flexShrink: 0,
                  }}
                />
              )}
            </MenuItem>
          );
        })
      }
    />
  );
};

// 当前代理卡：分组/节点下拉选择 + 延迟测试 + 排序
export const CurrentProxyCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: proxyView, isLoading } = useProxiesSWR();
  const { clashInfo } = useClashInfo();
  const defaultLatencyTimeout = useVergeStore(
    (s) => s.verge.default_latency_timeout,
  );
  const defaultLatencyTest = useVergeStore((s) => s.verge.default_latency_test);
  const currentProfile = useProfilesStore((s) => s.currentProfile);
  const headStates = useProxyHeadStateStore((s) => s.headStates);
  const { select } = useProxySelection();

  const currentProfileId = currentProfile?.uid || null;

  const getProfileStorageKey = useCallback(
    (baseKey: string) =>
      currentProfileId ? `${baseKey}:${currentProfileId}` : baseKey,
    [currentProfileId],
  );

  const readProfileScopedItem = useCallback(
    (baseKey: string) => {
      if (typeof window === "undefined") return null;
      const profileKey = getProfileStorageKey(baseKey);
      const profileValue = localStorage.getItem(profileKey);
      if (profileValue != null) {
        return profileValue;
      }

      if (profileKey !== baseKey) {
        const legacyValue = localStorage.getItem(baseKey);
        if (legacyValue != null) {
          localStorage.removeItem(baseKey);
          localStorage.setItem(profileKey, legacyValue);
          return legacyValue;
        }
      }

      return null;
    },
    [getProfileStorageKey],
  );

  const writeProfileScopedItem = useCallback(
    (baseKey: string, value: string) => {
      if (typeof window === "undefined") return;
      const profileKey = getProfileStorageKey(baseKey);
      localStorage.setItem(profileKey, value);
      if (profileKey !== baseKey) {
        localStorage.removeItem(baseKey);
      }
    },
    [getProfileStorageKey],
  );

  const mode = clashInfo?.mode?.toLowerCase() || "rule";
  const isGlobalMode = mode === "global";
  const isDirectMode = mode === "direct";

  const [sortType, setSortType] = useState<ProxySortType>(() => {
    const savedSortType = localStorage.getItem(STORAGE_KEY_SORT_TYPE);
    return savedSortType ? (Number(savedSortType) as ProxySortType) : 0;
  });

  const [selectedGroupName, setSelectedGroupName] = useState("");
  const [openSelect, setOpenSelect] = useState<OpenSelect>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setOpenSelect(null);
  }, [mode]);

  const delayButtonRef = useRef<HTMLButtonElement>(null);
  const groupDelayVersion = useGroupDelayVersion(selectedGroupName || null);

  const selectableGroups = useMemo(() => {
    if (!proxyView) return [];
    return proxyView.groups.filter(
      (group) =>
        !group.hidden &&
        (group.type === "Selector" || group.type === "URLTest"),
    );
  }, [proxyView]);

  const selectedGroup = useMemo(() => {
    if (!proxyView || isDirectMode) return null;
    if (isGlobalMode) return proxyView.global;
    return (
      selectableGroups.find(({ name }) => name === selectedGroupName) ?? null
    );
  }, [
    isDirectMode,
    isGlobalMode,
    proxyView,
    selectableGroups,
    selectedGroupName,
  ]);

  const optionsForGroup = useCallback(
    (group: IProxyGroupItem | null): ProxyOption[] =>
      group
        ? group.all.map((member, memberIndex) => ({
            memberIndex,
            member,
            value: optionValue(memberIndex, member),
            name: member.name,
            disabled: member.name === "DIRECT" || member.name === "REJECT",
          }))
        : [],
    [],
  );

  useEffect(() => {
    if (!selectedGroup) return;
    const customUrl = currentProfile
      ? headStates[currentProfile.uid]?.[selectedGroup.name]?.testUrl
      : undefined;
    delayManager.setUrl(
      selectedGroup.name,
      customUrl?.trim() ||
        selectedGroup.testUrl?.trim() ||
        defaultLatencyTest?.trim() ||
        "http://cp.cloudflare.com/generate_204",
    );
  }, [selectedGroup, currentProfile, headStates, defaultLatencyTest]);

  const unsortedProxyOptions = useMemo(
    () => optionsForGroup(selectedGroup),
    [optionsForGroup, selectedGroup],
  );

  useEffect(() => {
    if (!proxyView) return;
    if (isDirectMode) {
      setSelectedGroupName("DIRECT");
      return;
    }
    if (isGlobalMode) {
      setSelectedGroupName(proxyView.global?.name ?? "GLOBAL");
      return;
    }

    const savedGroup = readProfileScopedItem(STORAGE_KEY_GROUP);
    const primaryKeywords = ["auto", "select", "proxy", "节点选择", "自动选择"];
    const primaryGroup =
      selectableGroups.find((group) =>
        primaryKeywords.some((keyword) =>
          group.name.toLowerCase().includes(keyword.toLowerCase()),
        ),
      ) ?? selectableGroups[0];
    const nextGroup = selectableGroups.some(
      ({ name }) => name === selectedGroupName,
    )
      ? selectedGroupName
      : selectableGroups.some(({ name }) => name === savedGroup)
        ? savedGroup!
        : (primaryGroup?.name ?? "");
    if (nextGroup !== selectedGroupName) {
      setSelectedGroupName(nextGroup);
      if (nextGroup) writeProfileScopedItem(STORAGE_KEY_GROUP, nextGroup);
    }
  }, [
    isDirectMode,
    isGlobalMode,
    proxyView,
    readProfileScopedItem,
    selectableGroups,
    selectedGroupName,
    writeProfileScopedItem,
  ]);

  const currentOption = useMemo(() => {
    if (!proxyView) return undefined;
    if (isDirectMode) {
      const node = proxyView.direct;
      return node
        ? ({ memberIndex: 0, member: node } satisfies Pick<
            ProxyOption,
            "memberIndex" | "member"
          >)
        : undefined;
    }
    if (!selectedGroup) return undefined;
    const memberIndex = selectedGroup.all.findIndex(
      (p) => p.name === selectedGroup.now,
    );
    if (memberIndex < 0) return undefined;
    return { memberIndex, member: selectedGroup.all[memberIndex] };
  }, [isDirectMode, proxyView, selectedGroup]);

  const handleGroupChange = useCallback(
    (newGroupName: string) => {
      if (isGlobalMode || isDirectMode) return;
      setSelectedGroupName(newGroupName);
      writeProfileScopedItem(STORAGE_KEY_GROUP, newGroupName);
    },
    [isDirectMode, isGlobalMode, writeProfileScopedItem],
  );

  const handleProxyChange = useCallback(
    (value: string) => {
      if (isDirectMode) return;
      const option = unsortedProxyOptions.find(
        (candidate) => candidate.value === value,
      );
      if (!selectedGroup || !option || option.disabled) {
        return;
      }
      void select(selectedGroup, option.member);
    },
    [isDirectMode, selectedGroup, select, unsortedProxyOptions],
  );

  const goToProxies = useCallback(() => {
    void navigate({ to: "/proxies" });
  }, [navigate]);

  const currentMember = currentOption?.member;
  const currentProxy = currentMember;
  const selectedProxyName = currentMember?.name ?? "";

  const currentDelay = useMemo(() => {
    if (!currentMember || !selectedGroupName) return -1;
    return delayManager.getDelayFix(currentMember, selectedGroupName);
  }, [currentMember, selectedGroupName, groupDelayVersion]);

  const handleSortTypeChange = useCallback(() => {
    const newSortType = ((sortType + 1) % 3) as ProxySortType;
    setSortType(newSortType);
    localStorage.setItem(STORAGE_KEY_SORT_TYPE, newSortType.toString());
  }, [sortType]);

  const handleCheckDelay = useLockFn(async () => {
    const groupName = selectedGroupName;
    if (!groupName || isDirectMode) return;

    const timeout = defaultLatencyTimeout || DEFAULT_LATENCY_TIMEOUT;

    const interactable = unsortedProxyOptions
      .map(({ member }) => member)
      .filter((member) => member.name !== "DIRECT" && member.name !== "REJECT");

    if (interactable.length > 0) {
      try {
        await delayManager.checkListDelay(interactable, groupName, timeout);
      } catch (error) {
        console.error(
          `[CurrentProxyCard] 延迟测试出错，组: ${groupName}`,
          error,
        );
      }
    }

    void mutate(swrKeys.proxies);
  });

  const proxyOptions = useMemo(
    () =>
      isDirectMode || openSelect !== "proxy"
        ? []
        : sortProxyOptions(
            unsortedProxyOptions.filter((option) =>
              option.name
                .toLocaleLowerCase()
                .includes(filter.toLocaleLowerCase()),
            ),
            sortType,
            (member) => delayManager.getDelayFix(member, selectedGroupName),
            defaultLatencyTimeout,
          ),
    [
      isDirectMode,
      openSelect,
      filter,
      unsortedProxyOptions,
      sortType,
      defaultLatencyTimeout,
      groupDelayVersion,
    ],
  );

  const getSortIcon = (): React.ReactElement => {
    switch (sortType) {
      case 1:
        return <AccessTimeRoundedIcon fontSize="small" />;
      case 2:
        return <SortByAlphaRoundedIcon fontSize="small" />;
      default:
        return <SortRoundedIcon fontSize="small" />;
    }
  };

  const getSortTooltip = (): string => {
    switch (sortType) {
      case 0:
        return t("pages.proxies.sort.default");
      case 1:
        return t("pages.proxies.sort.delay");
      case 2:
        return t("pages.proxies.sort.name");
      default:
        return "";
    }
  };

  return (
    <Box className="overview-design" sx={{ height: "100%" }}>
      <EnhancedCard
        iconKind="shield"
        title={t("pages.home.components.currentProxy.title")}
        icon={<Shield />}
        action={
          <Box className="ds-tools">
            <span className="ds-chip">{t(`pages.proxies.modes.${mode}`)}</span>
            <Tooltip
              title={t(
                "pages.home.components.currentProxy.actions.refreshDelay",
              )}>
              <span>
                <OverviewIcon
                  label={t(
                    "pages.home.components.currentProxy.actions.refreshDelay",
                  )}
                  ref={delayButtonRef}
                  onClick={handleCheckDelay}
                  disabled={isDirectMode || unsortedProxyOptions.length === 0}
                  aria-label={t(
                    "pages.home.components.currentProxy.actions.refreshDelay",
                  )}>
                  <NetworkCheckRoundedIcon />
                </OverviewIcon>
              </span>
            </Tooltip>
            <Tooltip title={getSortTooltip()}>
              <OverviewIcon
                label={getSortTooltip()}
                onClick={handleSortTypeChange}>
                {getSortIcon()}
              </OverviewIcon>
            </Tooltip>
          </Box>
        }>
        {isLoading ? (
          <Box sx={{ py: 4, height: 24 }} />
        ) : currentProxy || (!isDirectMode && selectedGroup) ? (
          <Box>
            <label className="ds-search">
              <Search />
              <input
                aria-label={t("common.search.filterConditions")}
                placeholder={t("common.search.filterConditions")}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setOpenSelect("proxy");
                }}
              />
            </label>
            <Box sx={{ mb: 1.5 }}>
              <PersistentSelect
                label={t("pages.home.components.currentProxy.labels.group")}
                displayValue={
                  <Typography noWrap>{selectedGroupName}</Typography>
                }
                open={openSelect === "group"}
                disabled={isGlobalMode || isDirectMode}
                keepOpenRef={delayButtonRef}
                onOpenChange={(open) => setOpenSelect(open ? "group" : null)}
                renderOptions={() =>
                  selectableGroups.map((group) => (
                    <MenuItem
                      key={group.name}
                      role="option"
                      aria-selected={group.name === selectedGroupName}
                      selected={group.name === selectedGroupName}
                      onClick={() => handleGroupChange(group.name)}>
                      <Typography noWrap>{group.name}</Typography>
                    </MenuItem>
                  ))
                }
              />
            </Box>

            <PersistentProxySelect
              label={t("pages.home.components.currentProxy.labels.proxy")}
              groupName={selectedGroupName}
              fixed={selectedGroup?.fixed}
              value={
                currentOption
                  ? optionValue(currentOption.memberIndex, currentOption.member)
                  : ""
              }
              selectedName={selectedProxyName}
              selectedDelay={currentDelay}
              options={proxyOptions}
              open={openSelect === "proxy"}
              disabled={isDirectMode}
              keepOpenRef={delayButtonRef}
              onOpenChange={(open) => setOpenSelect(open ? "proxy" : null)}
              onChange={handleProxyChange}
            />
            <div className="ds-tags">
              {currentProxy?.type && (
                <span className="ds-chip">{currentProxy.type}</span>
              )}
              {currentProxy?.udp && <span className="ds-chip">UDP</span>}
              <span className="ds-chip">TCP</span>
              <span className="ds-good">
                {delayManager.formatDelay(currentDelay)}
              </span>
              <OverviewIcon
                label={t("navigation.sidebar.proxies")}
                onClick={goToProxies}>
                <ChevronRightIcon />
              </OverviewIcon>
            </div>
          </Box>
        ) : (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography
              sx={{ height: 24 }}
              variant="body1"
              color="text.secondary">
              {t("pages.home.components.currentProxy.labels.noActiveNode")}
            </Typography>
          </Box>
        )}
      </EnhancedCard>
    </Box>
  );
};
