export type Vec3 = [number, number, number];
export type CameraState = { yaw: number; pitch: number; zoom: number };
export const ROBOT_CENTER: Vec3 = [0, 2.32, 0.15];
export const ROBOT_BOUNDS = { min: [-0.96, 0, -0.48] as Vec3, max: [0.96, 4.68, 0.9] as Vec3 };
export const CAMERA_FOV = 35 * Math.PI / 180;
export const TABLET_ANCHOR: Vec3 = [0.47, 2.9, 0.84];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (v: Vec3, amount: number): Vec3 => [v[0] * amount, v[1] * amount, v[2] * amount];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (v: Vec3): Vec3 => scale(v, 1 / (Math.hypot(...v) || 1));
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function rotate(v: Vec3, rotation: Vec3): Vec3 {
  const [sx, sy, sz] = rotation.map(Math.sin);
  const [cx, cy, cz] = rotation.map(Math.cos);
  const y = v[1] * cx - v[2] * sx;
  const z = v[1] * sx + v[2] * cx;
  const x = v[0] * cy + z * sy;
  const zz = -v[0] * sy + z * cy;
  return [x * cz - y * sz, x * sz + y * cz, zz];
}

export function multiplyMatrices(a: Float32Array, b: Float32Array) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}

export function perspective(aspect: number, far = 120) {
  const f = 1 / Math.tan(CAMERA_FOV / 2);
  const near = 0.1;
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
}

export function lookAt(eye: Vec3, center: Vec3) {
  const z = normalize(add(eye, scale(center, -1)));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

export function cameraMatrices(state: CameraState, aspect: number) {
  const safeAspect = clamp(Number.isFinite(aspect) ? aspect : 1, 0.08, 20);
  const halfFov = Math.min(CAMERA_FOV / 2, Math.atan(Math.tan(CAMERA_FOV / 2) * safeAspect));
  // A bounding sphere guarantees the entire robot fits even during a full manual orbit.
  const radius = Math.max(...[ROBOT_BOUNDS.min, ROBOT_BOUNDS.max].map((p) => Math.hypot(...add(p, scale(ROBOT_CENTER, -1)))));
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 0.64, 0.3, 1);
  const distance = radius / Math.sin(halfFov) * 1.08 / zoom;
  const pitch = clamp(state.pitch, -0.35, 0.35);
  const eye = add(ROBOT_CENTER, scale([Math.sin(state.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(state.yaw) * Math.cos(pitch)], distance));
  return { eye, distance, matrix: multiplyMatrices(perspective(safeAspect, Math.max(120, distance * 2)), lookAt(eye, ROBOT_CENTER)) };
}

export function projectPoint(point: Vec3, matrix: Float32Array) {
  const v = [...point, 1];
  const clip = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) clip[row] += matrix[k * 4 + row] * v[k];
  return { x: clip[0] / clip[3], y: clip[1] / clip[3], z: clip[2] / clip[3], visible: clip[3] > 0 };
}

export function easeCamera(from: CameraState, to: CameraState, progress: number): CameraState {
  const t = clamp(progress, 0, 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const yawDelta = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  return { yaw: from.yaw + yawDelta * eased, pitch: from.pitch + (to.pitch - from.pitch) * eased, zoom: from.zoom + (to.zoom - from.zoom) * eased };
}

export function drawingBufferSize(width: number, height: number, pixelRatio: number) {
  const cssWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const cssHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const ratio = Math.min(Math.max(Number.isFinite(pixelRatio) ? pixelRatio : 1, 1), 1.75, 4096 / cssWidth, 4096 / cssHeight, Math.sqrt(1_600_000 / (cssWidth * cssHeight)));
  return { width: Math.max(1, Math.floor(cssWidth * ratio)), height: Math.max(1, Math.floor(cssHeight * ratio)) };
}
