import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { GlobalScriptRuntime } from "@/services/global-script-runtime";
import { useGlobalScriptsStore } from "@/stores/globalScriptsStore";

export const GlobalScriptsRuntime = () => {
  const runtime = useRef<GlobalScriptRuntime | null>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  useEffect(() => {
    const store = useGlobalScriptsStore.getState();
    const instance = new GlobalScriptRuntime({
      log: store.log,
      status: store.setStatus,
    });
    runtime.current = instance;
    instance.reconcile(store.scripts);
    const unsubscribe = useGlobalScriptsStore.subscribe((state, previous) => {
      if (state.scripts !== previous.scripts) instance.reconcile(state.scripts);
    });
    return () => {
      unsubscribe();
      instance.dispose();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    runtime.current?.routeChanged(pathname);
  }, [pathname]);
  return null;
};
