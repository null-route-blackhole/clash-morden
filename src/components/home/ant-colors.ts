// Ant Design palette with configurable opacity for data visuals.
const light = {
  blue: "#1677ff",
  gold: "#faad14",
  green: "#52c41a",
  red: "#f5222d",
  purple: "#722ed1",
  cyan: "#13c2c2",
  magenta: "#eb2f96",
};
const dark = {
  blue: "#69b1ff",
  gold: "#ffd666",
  green: "#95de64",
  red: "#ff7875",
  purple: "#b37feb",
  cyan: "#5cdbd3",
  magenta: "#ff85c0",
};
export const antColor = (
  name: keyof typeof light,
  isDark: boolean,
  intensity = 100,
  opacity = 100,
) => {
  const hex = (isDark ? dark : light)[name];
  const factor = Math.min(100, Math.max(0, intensity)) / 100;
  const rgb = [1, 3, 5].map((index) =>
    Math.round(parseInt(hex.slice(index, index + 2), 16) * factor),
  );
  return `rgba(${rgb.join(", ")}, ${Math.min(100, Math.max(0, opacity)) / 100})`;
};
export const getOverviewTrafficColors = (
  dark: boolean,
  intensity = 100,
  opacity = 100,
) => ({
  upload: antColor("blue", dark, intensity, opacity),
  download: antColor("gold", dark, intensity, opacity),
  active: antColor("green", dark, intensity, opacity),
  closed: antColor("magenta", dark, intensity, opacity),
  totalUpload: antColor("cyan", dark, intensity, opacity),
  totalDownload: antColor("purple", dark, intensity, opacity),
});
