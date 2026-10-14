import type { InterfaceStyle } from "@/stores/interfaceStyleStore";

/** Approved Test palettes. Saved Clash colors remain intact when switching back. */
export const getInterfacePalette = (
  style: InterfaceStyle,
  dark: boolean,
): Partial<IVergeThemeSettings> => {
  if (style === "clash") return {};
  const palettes = {
    outline: dark
      ? ["#14161b", "#1c1f26", "#91a5ef"]
      : ["#f6f7f9", "#ffffff", "#4d6ad7"],
    soft: dark
      ? ["#16171e", "#20212b", "#a6a7d2"]
      : ["#f2f3f6", "#ffffff", "#7c7fba"],
    glass: dark
      ? ["#151923", "#232936", "#91a5ef"]
      : ["#f3f6f9", "#ffffff", "#4d6ad7"],
    bold: dark
      ? ["#12151a", "#1c1f26", "#bcc5d8"]
      : ["#f4f5f6", "#ffffff", "#343d50"],
  };
  const [background, paper, accent] = palettes[style];
  return {
    background_color: background,
    paper_background_color: paper,
    primary_color: accent,
    secondary_color: dark ? "#b0b8c8" : "#6b7484",
    primary_text: dark ? "#e2e5eb" : "#252a34",
    secondary_text: dark ? "#969eac" : "#78818e",
    info_color: dark ? "#90afe0" : "#5077ae",
    success_color: dark ? "#8dc1a9" : "#49866d",
    warning_color: dark ? "#d9af79" : "#a0753b",
    error_color: dark ? "#df9199" : "#b35460",
  };
};
