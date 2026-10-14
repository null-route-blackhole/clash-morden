import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

const HomePage = lazy(() => import("@/pages/home"));

function IndexRouteComponent() {
  return <HomePage />;
}

export const Route = createFileRoute("/")({
  component: IndexRouteComponent,
});
