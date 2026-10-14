import * as THREE from "three/webgpu";
import { feature } from "topojson-client";

import { COUNTRIES_TOPOLOGY } from "@/assets/geo/countries-110m";

import type { EarthColorScheme } from "./renderer-types";

// 2D 平面彩色世界地图图层（政治地图风）：
// 蓝色海洋底色 + 每个国家独立配色 + 清晰国界线。
// 几何体按「三副本平铺」构建（x 偏移 -4/0/+4），随 centerLongitude 平移组位置，
// 避免换日线穿越产生横贯地图的伪线。随 morph（3D↔2D）淡入淡出。

const MAP_SCHEMES = {
  light: {
    ocean: "#a9d1ea",
    border: "#7fa3bd",
    // 12 色低饱和度国家配色
    land: [
      "#eed9c3",
      "#d5e4c9",
      "#c9d9ea",
      "#eccfdc",
      "#e2d9c3",
      "#d9d0ec",
      "#c9e0db",
      "#e6e0c6",
      "#cedacd",
      "#ddd2d2",
      "#c8dde8",
      "#e5cdcd",
    ],
  },
  dark: {
    ocean: "#143049",
    border: "#3d6482",
    land: [
      "#5a4d3e",
      "#4a5a45",
      "#41566a",
      "#5a4552",
      "#57503e",
      "#4d4a66",
      "#3f5c56",
      "#57553b",
      "#455345",
      "#554747",
      "#3d5565",
      "#5a4646",
    ],
  },
} as const;

const PLANE_WIDTH = 4; // 平面地图世界宽度（±2）

interface BorderMapLayerOptions {
  parent: THREE.Object3D;
  colorScheme: EarthColorScheme;
}

export interface BorderMapLayer {
  setMorph: (morph: number) => void;
  setCenterLongitude: (longitude: number) => void;
  setColorScheme: (scheme: EarthColorScheme) => void;
  dispose: () => void;
}

type Ring = number[][];

interface SimpleGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

interface SimpleFeature {
  properties?: { name?: string };
  geometry: SimpleGeometry | null;
}

const toRings = (
  geometry: SimpleGeometry,
): { outer: Ring; holes: Ring[] }[] => {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates as number[][][];
    return [{ outer, holes }];
  }
  return (geometry.coordinates as number[][][][]).map((polygon) => {
    const [outer, ...holes] = polygon;
    return { outer, holes };
  });
};

// 经度解卷：相邻点跨越 ±180 时连续累加 360，多边形自然延伸进相邻副本，
// 避免跨日线国家被画成横贯整张地图的直线
const unwrapLongitudes = (ring: Ring): Ring => {
  let offset = 0;
  let previous: number | null = null;
  return ring.map(([lon, lat]) => {
    if (previous !== null && Math.abs(lon - previous) > 180) {
      offset += lon > previous ? -360 : 360;
    }
    previous = lon;
    return [lon + offset, lat];
  });
};

// 国名哈希 → 稳定配色索引（同一国家所有副本同色）
const landColorIndex = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % MAP_SCHEMES.light.land.length;
};

const landColorOf = (index: number, scheme: keyof typeof MAP_SCHEMES) =>
  MAP_SCHEMES[scheme].land[index];

export const createBorderMapLayer = async (
  options: BorderMapLayerOptions,
): Promise<BorderMapLayer> => {
  const { parent } = options;
  let colorScheme = options.colorScheme;
  let morph = 0;
  let centerLongitude = 0;
  let disposed = false;

  const group = new THREE.Group();
  group.visible = false;
  parent.add(group);

  const contentGroup = new THREE.Group();
  group.add(contentGroup);

  // 海洋星空点缀（确定性伪随机星点，随主题换色，陆地覆盖其上）
  const makeStarField = () => {
    const starPositions: number[] = [];
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 420; i++) {
      // 避开中心区域（大多被陆地覆盖也无妨，均匀散布）
      starPositions.push(
        (random() - 0.5) * PLANE_WIDTH * 2,
        (random() - 0.5) * 2,
        0.0008,
      );
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    const starMaterial = new THREE.PointsMaterial({
      size: 0.004,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      color: new THREE.Color(colorScheme === "dark" ? "#9fc3e0" : "#3a6d94"),
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.renderOrder = 1.5;
    contentGroup.add(stars);
    return { starGeometry, starMaterial, stars };
  };
  const starField = makeStarField();

  // 海洋底色（整幅平面）
  const oceanMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    color: new THREE.Color(MAP_SCHEMES[colorScheme].ocean),
  });
  const oceanGeometry = new THREE.PlaneGeometry(PLANE_WIDTH * 2, 2);
  const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
  ocean.renderOrder = 1;
  contentGroup.add(ocean);

  // 国界线
  const borderMaterial = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    color: new THREE.Color(MAP_SCHEMES[colorScheme].border),
  });

  // 国家填充：每个国家（每副本）独立材质，便于按配色表着色
  const landMaterials: {
    material: THREE.MeshBasicMaterial;
    colorIndex: number;
  }[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const meshes: THREE.Mesh[] = [];
  const lineGroups: THREE.Group[] = [];

  const disposeLand = () => {
    for (const mesh of meshes) contentGroup.remove(mesh);
    for (const lineGroup of lineGroups) contentGroup.remove(lineGroup);
    for (const { material } of landMaterials) material.dispose();
    meshes.length = 0;
    lineGroups.length = 0;
    landMaterials.length = 0;
    for (const geometry of geometries) geometry.dispose();
    geometries.length = 0;
  };

  // TopoJSON 打包为模块（随 earth chunk 懒加载，无网络请求）
  const topo = COUNTRIES_TOPOLOGY as unknown as Parameters<typeof feature>[0];
  const collection = feature(
    topo,
    topo.objects.countries as never,
  ) as unknown as {
    features: SimpleFeature[];
  };

  const build = () => {
    disposeLand();

    for (const entry of collection.features) {
      const geometry = entry.geometry;
      if (!geometry) continue;

      const countryName = entry.properties?.name || "Unknown";
      const colorIndex = landColorIndex(countryName);
      const landColor = landColorOf(colorIndex, colorScheme);

      for (const { outer } of toRings(geometry)) {
        if (outer.length < 4) continue;

        const unwrapped = unwrapLongitudes(outer);

        // 陆地填充
        try {
          const shape = new THREE.Shape();
          unwrapped.forEach(([lon, lat], index) => {
            const x = (lon / 180) * 2;
            const y = lat / 90;
            if (index === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
          });
          const shapeGeometry = new THREE.ShapeGeometry(shape);
          geometries.push(shapeGeometry);
          const material = new THREE.MeshBasicMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
            color: new THREE.Color(landColor),
          });
          landMaterials.push({ material, colorIndex });
          const mesh = new THREE.Mesh(shapeGeometry, material);
          mesh.renderOrder = 2;
          contentGroup.add(mesh);
          meshes.push(mesh);
        } catch {
          // 自交环等异常跳过该多边形
        }

        // 国界线（解卷坐标，首尾闭合成自然穿越副本边界的路径）
        const points: THREE.Vector3[] = [];
        for (const [lon, lat] of unwrapped) {
          points.push(new THREE.Vector3((lon / 180) * 2, lat / 90, 0));
        }
        points.push(points[0].clone());

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        geometries.push(lineGeometry);
        const line = new THREE.Line(lineGeometry, borderMaterial);
        line.renderOrder = 3;
        const lineGroup = new THREE.Group();
        lineGroup.add(line);
        contentGroup.add(lineGroup);
        lineGroups.push(lineGroup);
      }
    }

    applyMorph();
    applyCenter();
  };

  const applyMorph = () => {
    group.visible = morph > 0.001;
    const opacity = Math.min(1, morph);
    oceanMaterial.opacity = opacity;
    borderMaterial.opacity = opacity;
    starField.starMaterial.opacity = opacity * 0.6;
    for (const { material } of landMaterials) material.opacity = opacity;
  };

  const applyCenter = () => {
    // 单一地图：整体平移对齐弧线投影中心（边缘裁剪即可，无副本平铺）
    contentGroup.position.x = -centerLongitude / 90;
  };

  const applyColorScheme = () => {
    oceanMaterial.color.set(MAP_SCHEMES[colorScheme].ocean);
    borderMaterial.color.set(MAP_SCHEMES[colorScheme].border);
    starField.starMaterial.color.set(
      new THREE.Color(colorScheme === "dark" ? "#9fc3e0" : "#3a6d94"),
    );
    for (const { material, colorIndex } of landMaterials) {
      const palette = MAP_SCHEMES[colorScheme].land;
      material.color.set(palette[colorIndex % palette.length]);
    }
  };

  build();

  return {
    setMorph(value) {
      if (disposed) return;
      morph = value;
      applyMorph();
    },
    setCenterLongitude(longitude) {
      if (disposed) return;
      centerLongitude = longitude;
      applyCenter();
    },
    setColorScheme(scheme) {
      if (disposed || scheme === colorScheme) return;
      colorScheme = scheme;
      applyColorScheme();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(group);
      contentGroup.remove(ocean);
      contentGroup.remove(starField.stars);
      disposeLand();
      oceanGeometry.dispose();
      oceanMaterial.dispose();
      starField.starGeometry.dispose();
      starField.starMaterial.dispose();
      borderMaterial.dispose();
    },
  };
};
