import { type ReactNode, useEffect } from "react";

type MemorySnapshot = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

const active = new Map<string, number>();

const snapshot = (): MemorySnapshot => {
  const memory = (performance as Performance & { memory?: MemorySnapshot })
    .memory;
  return memory ? { ...memory } : {};
};

export const useOverviewMemoryMonitor = (name: string) => {
  useEffect(() => {
    active.set(name, (active.get(name) ?? 0) + 1);
    return () => {
      active.set(name, Math.max(0, (active.get(name) ?? 1) - 1));
      if (active.get(name) === 0) active.delete(name);
    };
  }, [name]);
};

export const overviewMemorySnapshot = () => ({
  active: Object.fromEntries(active),
  memory: snapshot(),
});

export const OverviewMemoryBoundary = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => {
  useOverviewMemoryMonitor(name);
  return children;
};
