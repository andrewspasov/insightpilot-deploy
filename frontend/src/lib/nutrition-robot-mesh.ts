import { add, clamp, cross, normalize, rotate, scale, type Vec3 } from "./nutrition-3d-math";

type Material = { color: Vec3; roughness: number; metal: number; glow: number };
export const VERTEX_STRIDE = 12;
const silver: Material = { color: [0.72, 0.8, 0.86], roughness: 0.3, metal: 0.65, glow: 0 };
const ceramic: Material = { color: [0.87, 0.92, 0.95], roughness: 0.35, metal: 0.25, glow: 0 };
const graphite: Material = { color: [0.055, 0.085, 0.11], roughness: 0.3, metal: 0.7, glow: 0 };
const cyan: Material = { color: [0.02, 0.7, 0.92], roughness: 0.2, metal: 0.2, glow: 1.25 };
const amber: Material = { color: [1, 0.38, 0.05], roughness: 0.3, metal: 0.1, glow: 1 };
const glass: Material = { color: [0.015, 0.12, 0.18], roughness: 0.1, metal: 0.6, glow: 0.1 };
const zero: Vec3 = [0, 0, 0];

class MeshBuilder {
  vertices: number[] = [];

  vertex(position: Vec3, normal: Vec3, material: Material) {
    this.vertices.push(...position, ...normal, ...material.color, material.roughness, material.metal, material.glow);
  }

  surface(rows: number, columns: number, sample: (u: number, v: number) => { p: Vec3; n: Vec3 }, material: Material) {
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = sample(column / columns, row / rows);
      const b = sample((column + 1) / columns, row / rows);
      const c = sample((column + 1) / columns, (row + 1) / rows);
      const d = sample(column / columns, (row + 1) / rows);
      for (const point of [a, b, d, b, c, d]) this.vertex(point.p, point.n, material);
    }
  }

  ellipsoid(center: Vec3, extent: Vec3, material: Material, rotation: Vec3 = zero) {
    this.surface(12, 20, (u, v) => {
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI;
      const sphere: Vec3 = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      const p = sphere.map((value, axis) => value * extent[axis]) as Vec3;
      const n = normalize(sphere.map((value, axis) => value / extent[axis]) as Vec3);
      return { p: add(center, rotate(p, rotation)), n: rotate(n, rotation) };
    }, material);
  }

  box(center: Vec3, half: Vec3, radius: number, material: Material, rotation: Vec3 = zero) {
    const r = Math.min(radius, ...half);
    for (let face = 0; face < 6; face++) {
      const axis = Math.floor(face / 2);
      const sign = face % 2 ? 1 : -1;
      this.surface(4, 4, (u, v) => {
        const p: Vec3 = [0, 0, 0];
        p[axis] = half[axis] * sign;
        p[(axis + 1) % 3] = (u * 2 - 1) * half[(axis + 1) % 3];
        p[(axis + 2) % 3] = (v * 2 - 1) * half[(axis + 2) % 3];
        const inner = p.map((value, i) => clamp(value, -half[i] + r, half[i] - r)) as Vec3;
        const n = normalize(add(p, scale(inner, -1)));
        return { p: add(center, rotate(add(inner, scale(n, r)), rotation)), n: rotate(n, rotation) };
      }, material);
    }
  }

  tube(start: Vec3, end: Vec3, startRadius: number, endRadius: number, material: Material) {
    const delta = add(end, scale(start, -1));
    const length = Math.hypot(...delta);
    const direction = normalize(delta);
    const side = normalize(cross(direction, Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
    const up = cross(side, direction);
    const radial = (u: number) => add(scale(side, Math.cos(u * Math.PI * 2)), scale(up, Math.sin(u * Math.PI * 2)));
    this.surface(1, 16, (u, v) => {
      const radius = startRadius + (endRadius - startRadius) * v;
      const ring = radial(u);
      return {
        p: add(add(start, scale(delta, v)), scale(ring, radius)),
        n: normalize(add(ring, scale(direction, (startRadius - endRadius) / length))),
      };
    }, material);
    for (let segment = 0; segment < 16; segment++) for (const cap of [0, 1]) {
      const center = cap ? end : start;
      const radius = cap ? endRadius : startRadius;
      const n = scale(direction, cap ? 1 : -1);
      this.vertex(center, n, material);
      this.vertex(add(center, scale(radial(segment / 16), radius)), n, material);
      this.vertex(add(center, scale(radial((segment + 1) / 16), radius)), n, material);
    }
  }

  torus(center: Vec3, radius: number, thickness: number, material: Material, rotation: Vec3 = zero) {
    this.surface(6, 32, (u, v) => {
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const n: Vec3 = [Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)];
      const p: Vec3 = [(radius + thickness * Math.cos(b)) * Math.cos(a), (radius + thickness * Math.cos(b)) * Math.sin(a), thickness * Math.sin(b)];
      return { p: add(center, rotate(p, rotation)), n: rotate(n, rotation) };
    }, material);
  }
}

export function buildNutritionRobotMesh() {
  const m = new MeshBuilder();
  for (const side of [-1, 1]) {
    const hip: Vec3 = [side * 0.29, 2.35, 0];
    const knee: Vec3 = [side * 0.32, 1.35, 0.04];
    const ankle: Vec3 = [side * 0.34, 0.36, 0];
    m.box([side * 0.34, 0.15, 0.14], [0.19, 0.14, 0.36], 0.07, graphite);
    m.box([side * 0.34, 0.24, 0.21], [0.18, 0.08, 0.26], 0.055, ceramic);
    m.box([side * 0.34, 0.13, 0.49], [0.15, 0.028, 0.015], 0.012, cyan);
    m.ellipsoid(ankle, [0.14, 0.15, 0.14], graphite);
    m.tube(ankle, knee, 0.1, 0.15, graphite);
    m.ellipsoid([side * 0.34, 0.84, 0.02], [0.155, 0.42, 0.15], silver);
    m.box([side * 0.34, 0.89, 0.16], [0.09, 0.31, 0.06], 0.045, ceramic);
    m.tube([side * 0.27, 0.52, 0.21], [side * 0.27, 1.17, 0.21], 0.009, 0.009, cyan);
    m.ellipsoid(knee, [0.17, 0.17, 0.16], graphite);
    m.torus([side * 0.32, 1.35, 0.19], 0.1, 0.015, silver);
    m.ellipsoid([side * 0.32, 1.35, 0.2], [0.063, 0.063, 0.012], cyan);
    m.tube(knee, hip, 0.13, 0.2, graphite);
    m.ellipsoid([side * 0.3, 1.88, 0], [0.21, 0.44, 0.2], ceramic);
    m.box([side * 0.3, 1.94, 0.19], [0.12, 0.3, 0.05], 0.04, silver);
    m.ellipsoid(hip, [0.21, 0.19, 0.2], graphite);
    m.torus([side * 0.48, 2.35, 0], 0.12, 0.02, cyan, [0, Math.PI / 2, 0]);

    const shoulder: Vec3 = [side * 0.65, 3.48, 0];
    const elbow: Vec3 = [side * 0.79, 2.99, 0.1];
    const wrist: Vec3 = [side * 0.52, 2.81, 0.62];
    m.ellipsoid(shoulder, [0.2, 0.23, 0.21], graphite);
    m.ellipsoid([side * 0.69, 3.5, 0], [0.23, 0.23, 0.22], ceramic);
    m.torus([side * 0.88, 3.5, 0], 0.12, 0.022, cyan, [0, Math.PI / 2, 0]);
    m.tube(shoulder, elbow, 0.14, 0.11, silver);
    m.ellipsoid(elbow, [0.135, 0.14, 0.14], graphite);
    m.tube(elbow, wrist, 0.13, 0.1, ceramic);
    m.ellipsoid(wrist, [0.09, 0.11, 0.09], graphite);
    m.ellipsoid([side * 0.53, 2.79, 0.7], [0.1, 0.13, 0.085], silver);
    for (let finger = 0; finger < 3; finger++) m.box([side * 0.49, 2.78 + finger * 0.055, 0.78], [0.075, 0.02, 0.025], 0.015, graphite);
  }

  m.ellipsoid([0, 2.45, 0], [0.39, 0.25, 0.27], silver);
  m.box([0, 2.57, 0.23], [0.26, 0.075, 0.055], 0.035, graphite);
  m.tube([0, 2.56, 0], [0, 3.13, 0], 0.25, 0.3, graphite);
  for (let i = 0; i < 4; i++) {
    m.box([0, 2.72 + i * 0.115, 0.24], [0.25 + i * 0.025, 0.04, 0.06], 0.025, silver);
    m.box([0, 2.84 + i * 0.2, -0.3], [0.075, 0.06, 0.025], 0.02, amber);
  }
  m.ellipsoid([0, 3.34, 0], [0.53, 0.43, 0.3], graphite);
  for (const side of [-1, 1]) {
    m.box([side * 0.25, 3.41, 0.18], [0.25, 0.26, 0.17], 0.08, ceramic, [0, side * 0.15, side * -0.12]);
    m.box([side * 0.33, 3.29, -0.19], [0.19, 0.32, 0.12], 0.07, silver);
    m.tube([side * 0.11, 3.65, 0.3], [side * 0.39, 3.58, 0.3], 0.012, 0.012, cyan);
  }
  m.torus([0, 3.32, 0.37], 0.12, 0.027, graphite);
  m.torus([0, 3.32, 0.395], 0.083, 0.013, cyan);
  m.ellipsoid([0, 3.32, 0.4], [0.044, 0.044, 0.015], cyan);
  m.tube([0, 3.7, 0], [0, 3.94, 0], 0.115, 0.105, graphite);
  m.torus([0, 3.83, 0], 0.115, 0.018, silver, [Math.PI / 2, 0, 0]);
  m.ellipsoid([0, 4.21, 0], [0.3, 0.37, 0.28], silver);
  m.ellipsoid([0, 4.13, 0.17], [0.26, 0.255, 0.14], ceramic);
  m.box([0, 4.25, 0.284], [0.25, 0.065, 0.03], 0.04, graphite);
  for (const side of [-1, 1]) {
    m.box([side * 0.122, 4.25, 0.318], [0.075, 0.018, 0.015], 0.012, cyan, [0, 0, side * 0.08]);
    m.torus([side * 0.295, 4.22, 0], 0.117, 0.03, graphite, [0, Math.PI / 2, 0]);
    m.torus([side * 0.32, 4.22, 0], 0.087, 0.018, cyan, [0, Math.PI / 2, 0]);
    m.ellipsoid([side * 0.33, 4.22, 0], [0.012, 0.046, 0.046], glass);
  }
  m.box([0, 4.42, 0.18], [0.026, 0.07, 0.02], 0.015, cyan, [-0.5, 0, 0]);
  m.box([0.08, 4.47, 0.12], [0.028, 0.018, 0.025], 0.01, amber);
  m.ellipsoid([0, 4.16, 0.307], [0.037, 0.04, 0.025], silver);
  m.box([0, 4.06, 0.303], [0.077, 0.01, 0.012], 0.009, graphite);

  m.box([0, 2.95, 0.69], [0.59, 0.34, 0.037], 0.035, silver, [0.12, 0, 0]);
  m.box([0, 2.95, 0.733], [0.55, 0.302, 0.012], 0.011, glass, [0.12, 0, 0]);
  m.torus([0.11, 2.96, 0.79], 0.2, 0.009, cyan, [0.12, 0, 0]);
  m.torus([0.11, 2.96, 0.792], 0.15, 0.004, silver, [0.12, 0, 0]);
  for (let bar = 0; bar < 3; bar++) {
    m.box([-0.36 + bar * 0.09, 2.93, 0.78], [0.02, 0.065 + bar * 0.035, 0.006], 0.005, cyan);
  }
  m.box([0, 3.24, 0.76], [0.49, 0.007, 0.005], 0.004, cyan);
  const robotVertexCount = m.vertices.length / VERTEX_STRIDE;

  const floor: Material = { color: [0.035, 0.07, 0.095], roughness: 0.55, metal: 0.7, glow: 0 };
  const grid: Material = { ...cyan, color: [0.01, 0.2, 0.27], glow: 0.3 };
  m.tube([0, -0.12, 0], [0, -0.04, 0], 1.15, 1.15, floor);
  m.torus([0, -0.025, 0], 1.12, 0.012, cyan, [Math.PI / 2, 0, 0]);
  m.torus([0, -0.05, 0], 1.47, 0.005, grid, [Math.PI / 2, 0, 0]);
  for (let i = -6; i <= 6; i++) {
    m.tube([i, -0.15, -6], [i, -0.15, 6], 0.003, 0.003, grid);
    m.tube([-6, -0.15, i], [6, -0.15, i], 0.003, 0.003, grid);
  }
  return { vertices: new Float32Array(m.vertices), robotVertexCount };
}
