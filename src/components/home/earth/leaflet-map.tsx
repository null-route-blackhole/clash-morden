import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { createGreatCircle } from "./earth-math";
import { type MapStyle, mapStyleUrl } from "./map-styles";
import { createEarthRenderSnapshot } from "./render-snapshot";
import type { EarthColorScheme } from "./renderer-types";
import type { EarthEndpointInfo, EarthLocation, EarthRoute } from "./types";

const ROUTES_SOURCE = "clashmorden-routes";
const POINTS_SOURCE = "clashmorden-points";
const FLOW_SOURCE = "clashmorden-flow";
const PROXIED_COLOR = "#4f9dff";
const DIRECT_COLOR = "#ff7a1a";
const ORIGIN_COLOR = "#ffffff";

const curve = (from: EarthLocation, to: EarthLocation): [number, number][] => {
  // Project the exact same great-circle samples as the 3D route layer.
  // Radial altitude affects the globe only; never turn it into planar lift.
  let previousLongitude = from.longitude;
  const points: [number, number][] = createGreatCircle(from, to).map(
    (point) => {
      let longitude = (Math.atan2(-point.z, point.x) * 180) / Math.PI;
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
      previousLongitude = longitude;
      const latitude =
        (Math.atan2(point.y, Math.hypot(point.x, point.z)) * 180) / Math.PI;
      return [longitude, Math.max(-85.051129, Math.min(85.051129, latitude))];
    },
  );
  // Mercator exaggerates polar great circles. Scale the arc's deviation from
  // its endpoint chord uniformly, rather than clipping the top into a flat line.
  const mercator = (latitude: number) =>
    Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  const startY = mercator(points[0][1]);
  const endY = mercator(points.at(-1)![1]);
  const upper = mercator(
    Math.min(85.051129, Math.max(from.latitude, to.latitude) + 8),
  );
  const lower = mercator(
    Math.max(-85.051129, Math.min(from.latitude, to.latitude) - 8),
  );
  let scale = 1;
  for (let index = 1; index < points.length - 1; index++) {
    const chord = startY + ((endY - startY) * index) / (points.length - 1);
    const deviation = mercator(points[index][1]) - chord;
    if (deviation > 0) scale = Math.min(scale, (upper - chord) / deviation);
    if (deviation < 0) scale = Math.min(scale, (lower - chord) / deviation);
  }
  return points.map(([longitude, latitude], index) => {
    const chord = startY + ((endY - startY) * index) / (points.length - 1);
    const y = chord + (mercator(latitude) - chord) * Math.max(0, scale);
    return [
      longitude,
      ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI,
    ];
  });
};

// MapLibre does not wrap a LineString at the antimeridian. Split the curve at
// +/-180 so a short Pacific route cannot become a line across the whole map.
const splitAtAntimeridian = (points: [number, number][]) => {
  const lines: [number, number][][] = [[]];
  const normalize = (longitude: number) => {
    let value = longitude;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
  };
  points.forEach(([longitude, latitude], index) => {
    const current = normalize(longitude);
    if (index === 0) {
      lines[0].push([current, latitude]);
      return;
    }
    const previous = lines.at(-1)?.at(-1);
    if (!previous) return;
    let adjusted = current;
    while (adjusted - previous[0] > 180) adjusted -= 360;
    while (adjusted - previous[0] < -180) adjusted += 360;
    if (adjusted > 180 || adjusted < -180) {
      const boundary = adjusted > 180 ? 180 : -180;
      const ratio = (boundary - previous[0]) / (adjusted - previous[0]);
      const crossingLat = previous[1] + (latitude - previous[1]) * ratio;
      lines.at(-1)?.push([boundary, crossingLat]);
      lines.push([[boundary === 180 ? -180 : 180, crossingLat]]);
    }
    lines.at(-1)?.push([normalize(adjusted), latitude]);
  });
  return lines.filter((line) => line.length > 1);
};

const updateSources = (
  map: MapLibreMap,
  routes: EarthRoute[],
  origin: EarthLocation | null,
) => {
  const routeFeatures = routes.flatMap((route) => {
    const from = route.path[0];
    const to = route.path.at(-1);
    if (!from || !to) return [];
    return [
      {
        type: "Feature" as const,
        properties: {
          direct: route.direct ? 1 : 0,
          connections: route.connections,
        },
        geometry: {
          type: "MultiLineString" as const,
          coordinates: splitAtAntimeridian(curve(from, to)),
        },
      },
    ];
  });
  const pointFeatures = createEarthRenderSnapshot(routes).endpoints.map(
    (endpoint) => ({
      type: "Feature" as const,
      properties: {
        direct: endpoint.direct ? 1 : 0,
        origin: endpoint.role === "origin" ? 1 : 0,
        info: JSON.stringify(endpoint),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [endpoint.longitude, endpoint.latitude],
      },
    }),
  );
  if (origin && !pointFeatures.some((feature) => feature.properties.origin))
    pointFeatures.push({
      type: "Feature",
      properties: {
        direct: 0,
        origin: 1,
        info: JSON.stringify({
          city: origin.city,
          country: origin.country,
          role: "origin",
          connections: 0,
          topHosts: [],
        }),
      },
      geometry: {
        type: "Point",
        coordinates: [origin.longitude, origin.latitude],
      },
    });
  (map.getSource(ROUTES_SOURCE) as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: routeFeatures,
  });
  (map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: pointFeatures,
  });
};

const updateFlow = (map: MapLibreMap, routes: EarthRoute[], phase: number) => {
  const features = routes.flatMap((route, index) => {
    const from = route.path[0];
    const to = route.path.at(-1);
    if (!from || !to) return [];
    const points = curve(from, to);
    const streaks = (["upload", "download"] as const).flatMap((direction) => {
      if (route[direction] <= 0) return [];
      const head = (phase + index * 0.037) % 1;
      const start = Math.floor(Math.max(0, head - 0.14) * (points.length - 1));
      const end = Math.ceil(head * (points.length - 1));
      const directedPoints =
        direction === "download" ? [...points].reverse() : points;
      const coordinates = directedPoints.slice(start, end + 1);
      if (coordinates.length < 2) return [];
      return [
        {
          type: "Feature" as const,
          properties: {
            direct: route.direct ? 1 : 0,
            connections: route.connections,
            intensity: 0.96,
          },
          geometry: {
            type: "MultiLineString" as const,
            coordinates: splitAtAntimeridian(coordinates),
          },
        },
      ];
    });
    return streaks;
  });
  (map.getSource(FLOW_SOURCE) as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features,
  });
};

interface Props {
  routes: EarthRoute[];
  origin: EarthLocation | null;
  colorScheme: EarthColorScheme;
  showCityLabels?: boolean;
  zoomLocked?: boolean;
  mapStyle?: MapStyle;
  onEndpointHover: (
    info: EarthEndpointInfo | null,
    x?: number,
    y?: number,
  ) => void;
}

export const LeafletMapOverlay = ({
  routes,
  origin,
  colorScheme,
  showCityLabels = true,
  zoomLocked = true,
  mapStyle = "zashboard",
  onEndpointHover,
}: Props) => {
  const hoverRef = useRef(onEndpointHover);
  hoverRef.current = onEndpointHover;
  const appliedStyle = useRef(mapStyle);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const showLabelsRef = useRef(showCityLabels);
  const dataRef = useRef({ routes, origin });
  dataRef.current = { routes, origin };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: mapStyleUrl(appliedStyle.current),
      pitch: 0,
      center: [180, 20],
      zoom: 1.35,
      minZoom: 1,
      maxZoom: 18,
      renderWorldCopies: true,
      attributionControl: false,
      scrollZoom: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    const clearHover = () => {
      hoverRef.current(null);
      map.getCanvas().style.cursor = "";
    };
    map.on("mousemove", (event) => {
      if (!map.getLayer("clashmorden-route-points")) return;
      const [feature] = map.queryRenderedFeatures(
        [
          [event.point.x - 6, event.point.y - 6],
          [event.point.x + 6, event.point.y + 6],
        ],
        { layers: ["clashmorden-route-points"] },
      );
      if (!feature?.properties?.info) {
        clearHover();
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      hoverRef.current(
        JSON.parse(feature.properties.info),
        event.originalEvent.clientX,
        event.originalEvent.clientY,
      );
    });
    map.getCanvas().addEventListener("mouseleave", clearHover);
    const avoidLabelCollisions = () => {
      const accepted: DOMRect[] = [];
      const bounds = container.getBoundingClientRect();
      for (const marker of markersRef.current.values()) {
        const element = marker.getElement();
        const rect = element.getBoundingClientRect();
        const overlaps = accepted.some(
          (other) =>
            rect.left < other.right + 6 &&
            rect.right + 6 > other.left &&
            rect.top < other.bottom + 6 &&
            rect.bottom + 6 > other.top,
        );
        const visible =
          showLabelsRef.current &&
          !overlaps &&
          rect.left >= bounds.left &&
          rect.right <= bounds.right &&
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom;
        element.style.visibility = visible ? "visible" : "hidden";
        if (visible) accepted.push(rect);
      }
    };
    map.on("render", avoidLabelCollisions);
    let frame = 0;
    map.on("style.load", () => {
      cancelAnimationFrame(frame);
      map.addSource(ROUTES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(POINTS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(FLOW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "clashmorden-route-lines",
        type: "line",
        source: ROUTES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "direct"], 1],
            DIRECT_COLOR,
            PROXIED_COLOR,
          ],
          "line-width": 1.45,
          "line-opacity": 0.96,
        },
      });
      map.addLayer({
        id: "clashmorden-route-points",
        type: "circle",
        source: POINTS_SOURCE,
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "origin"], 1],
            ORIGIN_COLOR,
            ["==", ["get", "direct"], 1],
            DIRECT_COLOR,
            PROXIED_COLOR,
          ],
          "circle-radius": ["case", ["==", ["get", "origin"], 1], 5, 3.5],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "origin"], 1],
            PROXIED_COLOR,
            "#ffffff",
          ],
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "clashmorden-flow-lines",
        type: "line",
        source: FLOW_SOURCE,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "direct"], 1],
            "#ffd2a8",
            "#c9e4ff",
          ],
          "line-width": 1.45,
          "line-opacity": ["get", "intensity"],
        },
      });
      map.addLayer({
        id: "clashmorden-flow-points",
        type: "circle",
        source: FLOW_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "direct"], 1],
            DIRECT_COLOR,
            PROXIED_COLOR,
          ],
          "circle-radius": 3.5,
          "circle-opacity": 0.95,
          "circle-blur": 0.15,
        },
      });
      updateSources(map, dataRef.current.routes, dataRef.current.origin);
      setMapReady(true);
      const animate = (time: number) => {
        updateFlow(map, dataRef.current.routes, (time / 850) % 1);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    });
    mapRef.current = map;
    return () => {
      cancelAnimationFrame(frame);
      hoverRef.current(null);
      map.getCanvas().removeEventListener("mouseleave", clearHover);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === mapStyle) return;
    const oldUrl = mapStyleUrl(appliedStyle.current);
    appliedStyle.current = mapStyle;
    map.setPitch(0);
    map.setBearing(0);
    if (oldUrl !== mapStyleUrl(mapStyle)) {
      setMapReady(false);
      map.setStyle(mapStyleUrl(mapStyle));
    }
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (zoomLocked) map.scrollZoom.disable();
    else map.scrollZoom.enable();
  }, [zoomLocked]);

  useEffect(() => {
    showLabelsRef.current = showCityLabels;
    for (const marker of markersRef.current.values()) {
      marker.getElement().style.display = showCityLabels ? "" : "none";
    }
  }, [showCityLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.isStyleLoaded()) return;
    const next = new Map<string, maplibregl.Marker>();
    for (const point of [origin, ...routes.map((route) => route.path.at(-1))]) {
      if (!point?.city) continue;
      const key = `${point.longitude}:${point.latitude}:${point.city}`;
      let marker = next.get(key) ?? markersRef.current.get(key);
      if (!marker) {
        const element = document.createElement("div");
        element.className = "clashmorden-map-city-label";
        element.style.pointerEvents = "auto";
        element.textContent = point.city;
        marker = new maplibregl.Marker({ element, anchor: "bottom" })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);
      }
      const element = marker.getElement();
      element.onmousemove = (event) => {
        const endpoint = createEarthRenderSnapshot(
          dataRef.current.routes,
        ).endpoints.find(
          (endpoint) =>
            endpoint.city === point.city &&
            endpoint.longitude === point.longitude &&
            endpoint.latitude === point.latitude,
        );
        if (endpoint) hoverRef.current(endpoint, event.clientX, event.clientY);
      };
      element.onmouseleave = () => hoverRef.current(null);
      element.style.display = showLabelsRef.current ? "" : "none";
      next.set(key, marker);
    }
    for (const [key, marker] of markersRef.current) {
      if (!next.has(key)) marker.remove();
    }
    markersRef.current = next;
    map.triggerRepaint();
  }, [mapReady, routes, origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) updateSources(map, routes, origin);
  }, [routes, origin]);

  return (
    <div
      ref={containerRef}
      className={`clashmorden-maplibre clashmorden-maplibre-${colorScheme}`}
    />
  );
};
