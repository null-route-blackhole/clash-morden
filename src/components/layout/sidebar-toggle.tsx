import { IconButton, Tooltip } from "@mui/material";
import { PanelLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSidebarStore } from "@/stores/sidebarStore";

// 导航栏三态切换按钮（标题栏左侧，所有页面可见）：
// 展开 → 收起（仅图标）→ 隐藏（完全不显示）循环
export const SidebarToggle = () => {
  const { t } = useTranslation();
  const mode = useSidebarStore((s) => s.mode);
  const cycleMode = useSidebarStore((s) => s.cycleMode);

  const tooltip = t(`navigation.sidebar.actions.${mode}`);
  const iconSize = 16;

  return (
    <Tooltip title={tooltip} placement="bottom">
      <IconButton
        className="interface-borderless"
        aria-label={tooltip}
        size="small"
        onClick={cycleMode}
        sx={{
          height: 30,
          width: 30,
          minHeight: 30,
          minWidth: 30,
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0,
          borderRadius: 1,
          border: 0,
          borderColor: "divider",
          color: "text.secondary",
          bgcolor: "transparent",
          boxShadow: "none",
          transition: "background-color .2s, box-shadow .2s",
          "&:hover": {
            bgcolor: "action.hover",
            boxShadow: "none",
          },
        }}>
        {mode === "expanded" ? (
          <PanelLeft size={iconSize} strokeWidth={1.65} />
        ) : mode === "collapsed" ? (
          <PanelLeftClose size={iconSize} strokeWidth={1.65} />
        ) : (
          <PanelLeftOpen size={iconSize} strokeWidth={1.65} />
        )}
      </IconButton>
    </Tooltip>
  );
};
