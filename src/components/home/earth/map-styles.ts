export const MAP_STYLES = [
  { id: "positron", label: "Positron" },
  { id: "bright", label: "Bright" },
  { id: "liberty", label: "Liberty" },
  { id: "dark", label: "Dark" },
  { id: "fiord", label: "Fiord" },
  { id: "liberty-3d", label: "Liberty 3D" },
] as const;
export type MapStyle = (typeof MAP_STYLES)[number]["id"];
export const mapStyleUrl = (style: MapStyle) =>
  `https://tiles.openfreemap.org/styles/${style === "liberty-3d" ? "liberty" : style}`;
