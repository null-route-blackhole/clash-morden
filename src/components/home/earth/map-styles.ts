export const MAP_STYLES = [
  { id: "zashboard", label: "Zashboard" },
  { id: "dark", label: "Dark" },
] as const;
export type MapStyle = (typeof MAP_STYLES)[number]["id"];
export const mapStyleUrl = (style: MapStyle) =>
  `https://tiles.openfreemap.org/styles/${style === "zashboard" ? "bright" : "dark"}`;
