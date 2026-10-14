import { useConnectionData } from "@/hooks/use-connection-data";

// Keep one shared SWR subscription alive across page changes without rerendering Layout.
export const ConnectionHistoryMonitor = () => {
  useConnectionData();
  return null;
};
