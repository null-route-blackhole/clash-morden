import { create } from "zustand";
import { persist } from "zustand/middleware";

export const INTERFACE_STYLES = [
  "clash",
  "outline",
  "soft",
  "glass",
  "bold",
] as const;
export type InterfaceStyle = (typeof INTERFACE_STYLES)[number];
export interface InterfaceAppearance {
  style: InterfaceStyle;
  compact: boolean;
}

interface InterfaceStyleState {
  appearance: InterfaceAppearance;
  preview: InterfaceAppearance | null;
  colorIntensity: number;
  colorOpacity: number;
  setColorIntensity: (value: number) => void;
  setColorOpacity: (value: number) => void;
  setPreview: (value: InterfaceAppearance | null) => void;
  save: () => void;
}

export const useInterfaceStyleStore = create<InterfaceStyleState>()(
  persist(
    (set) => ({
      appearance: { style: "outline", compact: false },
      preview: null,
      colorIntensity: 100,
      colorOpacity: 100,
      setColorOpacity: (value) => {
        if (Number.isFinite(value))
          set({ colorOpacity: Math.min(100, Math.max(0, value)) });
      },
      setColorIntensity: (value) => {
        if (Number.isFinite(value))
          set({ colorIntensity: Math.min(100, Math.max(0, value)) });
      },
      setPreview: (preview) => set({ preview }),
      save: () =>
        set((state) => ({
          appearance: state.preview ?? state.appearance,
          preview: null,
        })),
    }),
    {
      name: "interface-appearance-v1",
      partialize: (state) => ({
        appearance: state.appearance,
        colorIntensity: state.colorIntensity,
        colorOpacity: state.colorOpacity,
      }),
      merge: (persisted, current) => {
        const stored = (
          persisted as { appearance?: Partial<InterfaceAppearance> } | undefined
        )?.appearance;
        const opacity = (persisted as { colorOpacity?: unknown } | undefined)
          ?.colorOpacity;
        const intensity = (
          persisted as { colorIntensity?: unknown } | undefined
        )?.colorIntensity;
        return {
          ...current,
          colorOpacity:
            typeof opacity === "number" && Number.isFinite(opacity)
              ? Math.min(100, Math.max(0, opacity))
              : 100,
          colorIntensity:
            typeof intensity === "number" && Number.isFinite(intensity)
              ? Math.min(100, Math.max(0, intensity))
              : 100,
          appearance: {
            style: INTERFACE_STYLES.includes(stored?.style as InterfaceStyle)
              ? stored!.style!
              : "outline",
            compact: stored?.compact === true,
          },
        };
      },
    },
  ),
);
