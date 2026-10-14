export const DEFAULT_DELAY_TIMEOUT = 5000;

/**
 * 延迟排序比较：错误/超时的节点排在最后，其余按延迟升序。
 * 与 delayManager.formatDelayColor 的阈值语义一致。
 */
export const compareByDelay = (
  a: number,
  b: number,
  timeout = DEFAULT_DELAY_TIMEOUT,
) => {
  const isBad = (delay: number) =>
    delay <= 0 || delay > 1e5 || delay >= timeout;
  const aBad = isBad(a);
  const bBad = isBad(b);
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  return a - b;
};
