/** Zero disables a listener; enabled ports follow the existing nonprivileged range. */
export function parseProxyPort(input: string): number | undefined {
  if (!/^\d+$/.test(input)) return undefined;
  const port = Number(input);
  return Number.isInteger(port) &&
    (port === 0 || (port >= 1000 && port <= 65535))
    ? port
    : undefined;
}
