/** Allocate the visible canvas width while keeping counts and a short label readable.
 * When the minimum widths cannot fit, overflow is intentional and can be dragged.
 */
export const fitFlowColumns = (
  columns: { width: number; countWidth: number }[],
  viewportWidth: number,
  zoom: number,
) => {
  const available = Math.max(
    0,
    viewportWidth / zoom - 32 - Math.max(0, columns.length - 1) * 36,
  );
  const natural = columns.map((column) =>
    Math.min(260, Math.max(64, column.width)),
  );
  const minimums = columns.map((column) =>
    Math.max(64, column.countWidth + 40),
  );
  const total = natural.reduce((sum, width) => sum + width, 0);
  const shrink = Math.max(0, total - available);
  const capacity = natural.reduce(
    (sum, width, index) => sum + Math.max(0, width - minimums[index]),
    0,
  );
  return columns.map((column, index) => {
    const width =
      natural[index] -
      (Math.min(shrink, capacity) *
        Math.max(0, natural[index] - minimums[index])) /
        (capacity || 1);
    return { width, labelWidth: width - 32 - column.countWidth };
  });
};
