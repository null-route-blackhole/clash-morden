import { useLockFn } from "ahooks";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { getVersion } from "tauri-plugin-mihomo-api";

import { useNotice } from "@/components/base/notifies";
import { setCoreRunning } from "@/services/cmds";
import { getErrorMessage } from "@/utils";

/**
 * 内核存活探测 + 启停控制（原 zashboard 概览页的顶栏逻辑）。
 * 探测：getVersion 会真正向内核发 HTTP 请求，内核未运行时会 reject。
 * 注意：SWR 失败后会保留上一次成功的数据，所以 alive 必须同时看 error，
 * 否则内核停止后状态不翻转。
 */
export const useKernelAlive = () => {
  const { notice } = useNotice();

  const { data, error, isLoading } = useSWR(
    "home-kernel-alive",
    async () => {
      await getVersion();
      return true;
    },
    {
      errorRetryInterval: 3000,
      refreshInterval: 3000,
      shouldRetryOnError: true,
    },
  );

  const alive = !!data && !error;
  const loading = isLoading && !error;

  const [coreBusy, setCoreBusy] = useState(false);
  const prevAliveRef = useRef(alive);
  const toggleCore = useLockFn(async () => {
    setCoreBusy(true);
    try {
      await setCoreRunning(!alive);
    } catch (err: unknown) {
      notice("error", getErrorMessage(err));
      setCoreBusy(false);
    }
  });
  // 探活结果翻转 = 启停生效，结束忙碌态；另加 10s 兜底超时
  useEffect(() => {
    if (coreBusy && alive !== prevAliveRef.current) {
      setCoreBusy(false);
    }
    prevAliveRef.current = alive;
  }, [alive, coreBusy]);
  useEffect(() => {
    if (!coreBusy) return;
    const timer = setTimeout(() => setCoreBusy(false), 10_000);
    return () => clearTimeout(timer);
  }, [coreBusy]);

  return { alive, loading, coreBusy, toggleCore };
};
