import { antColor } from "../ant-colors";

const roles = ["blue", "purple", "cyan", "green", "gold"] as const;
export const flowColor = (role: number, dark: boolean, intensity = 100) =>
  antColor(roles[role % roles.length], dark, intensity);

export const flowRole = (layer: number, groupDepth: number) =>
  layer < 2
    ? layer
    : layer === groupDepth + 2
      ? 3
      : layer === groupDepth + 3
        ? 4
        : 2;
