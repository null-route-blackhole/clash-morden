import { create } from "zustand";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

const NEXT_MODE: Record<SidebarMode, SidebarMode> = {
  expanded: "collapsed",
  collapsed: "hidden",
  hidden: "expanded",
};

interface SidebarState {
  /** 导航栏三态：展开 / 收起（仅图标）/ 隐藏（完全不显示） */
  mode: SidebarMode;
  cycleMode: () => void;
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  mode: "expanded",
  cycleMode: () => set((state) => ({ mode: NEXT_MODE[state.mode] })),
}));
