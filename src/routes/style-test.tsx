import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const StyleTestPage = lazy(() => import("@/pages/style-test"));

export const Route = createFileRoute("/style-test")({
  component: StyleTestPage,
});
