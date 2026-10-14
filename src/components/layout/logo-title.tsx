import DarkMode from "@mui/icons-material/DarkMode";
import LightMode from "@mui/icons-material/LightMode";
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useCustomTheme } from "@/components/layout/use-custom-theme";
import { useThemeModeStore } from "@/stores";
import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";
import { cn } from "@/utils";
import { OS } from "@/utils/get-system";

/**
 * 侧栏顶部区域：保留最初版式（pt-2 / macOS pt-4 / 折叠 pb-2），
 * 仅删除了 logo 图标与 App 名称的子块，明暗主题切换按钮保持原始定位。
 */
export const LogoTitle = ({
  sidebarCollapsed,
}: {
  sidebarCollapsed: boolean;
}) => {
  const modern = useInterfaceStyleStore(
    (s) => (s.preview ?? s.appearance).style !== "clash",
  );
  const { toggleTheme } = useCustomTheme();
  const mode = useThemeModeStore((s) => s.themeMode);
  const isDark = mode === "dark";
  const isMacOS = OS === "macos";

  return (
    <div
      className={cn("relative box-border flex w-full shrink-0 grow-0 pt-2", {
        "pb-2": sidebarCollapsed,
        "pt-4": isMacOS,
      })}>
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.button
            key={isDark ? "dark" : "light"}
            initial={{ x: -25, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className={cn(
              "absolute top-0 right-4 z-10 h-4 w-4 cursor-pointer border-none bg-transparent",
              {
                "-top-1 right-5.5": sidebarCollapsed,
                "top-2": isMacOS,
                "top-5": sidebarCollapsed && isMacOS,
              },
            )}
            aria-label={isDark ? "切换浅色主题" : "切换深色主题"}
            onClick={() => toggleTheme(isDark ? "light" : "dark")}>
            {modern ? (
              isDark ? (
                <Moon size={16} strokeWidth={1.65} />
              ) : (
                <Sun size={16} strokeWidth={1.65} />
              )
            ) : isDark ? (
              <DarkMode
                fontSize="inherit"
                className="fill-primary! h-full w-full"
              />
            ) : (
              <LightMode
                fontSize="inherit"
                className="fill-primary! h-full w-full"
              />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
