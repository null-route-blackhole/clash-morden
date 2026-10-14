// Six evenly spaced hues; each metric pair is 180° apart.
export const getTrafficColors = (dark: boolean) => {
  const lightness = dark ? 68 : 38;
  const color = (hue: number) => `hsl(${hue}, 38%, ${lightness}%)`;
  return {
    upload: color(210),
    download: color(30),
    active: color(150),
    closed: color(330),
    totalUpload: color(90),
    totalDownload: color(270),
  };
};
