import { useRef, useState } from "react";

import { useNotice } from "@/components/base/notifies";
import { getErrorMessage } from "@/utils";

/** Keep collection updates keyed by name, including while their view refreshes. */
export function useProviderUpdates(
  updateProvider: (name: string) => Promise<unknown>,
  refresh: () => Promise<unknown>,
) {
  const { notice } = useNotice();
  const active = useRef(new Set<string>());
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = async (names: string[]) => {
    const pending = [...new Set(names)].filter((name) => !active.current.has(name));
    if (!pending.length) return;

    pending.forEach((name) => {
      active.current.add(name);
    });
    setUpdating((previous) => ({
      ...previous,
      ...Object.fromEntries(pending.map((name) => [name, true])),
    }));
    setErrors((previous) => {
      const next = { ...previous };
      pending.forEach((name) => {
        delete next[name];
      });
      return next;
    });

    try {
      const results = await Promise.allSettled(pending.map(updateProvider));
      setErrors((previous) => {
        const next = { ...previous };
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            next[pending[index]] = getErrorMessage(result.reason);
          }
        });
        return next;
      });
      if (results.some((result) => result.status === "fulfilled")) {
        await refresh();
      }
    } catch (error) {
      notice("error", getErrorMessage(error));
    } finally {
      pending.forEach((name) => {
        active.current.delete(name);
      });
      setUpdating((previous) => ({
        ...previous,
        ...Object.fromEntries(pending.map((name) => [name, false])),
      }));
    }
  };

  return { updating, errors, update };
}
