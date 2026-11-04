import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(file, globals = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  runInNewContext(outputText, { exports, Float32Array, ...globals, require: (name) => load(name.replace("./", ""), globals, cache) });
  return exports;
}
const math = load("nutrition-3d-math");
const { buildNutritionRobotMesh, VERTEX_STRIDE } = load("nutrition-robot-mesh");
const { NUTRITION_STAGES } = load("nutrition-experience");

test("the procedural robot has actual triangle geometry, normalized normals and finite materials", () => {
  const mesh = buildNutritionRobotMesh();
  const count = mesh.vertices.length / VERTEX_STRIDE;
  assert.ok(count > 10_000 && count < 180_000);
  assert.equal(count % 3, 0);
  assert.equal(mesh.robotVertexCount % 3, 0);
  assert.ok(mesh.robotVertexCount < count);
  assert.ok(mesh.vertices.every(Number.isFinite));
  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * VERTEX_STRIDE;
    assert.ok(Math.abs(Math.hypot(...mesh.vertices.subarray(offset + 3, offset + 6)) - 1) < 0.00001);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(mesh.vertices[offset + 6 + axis] >= 0 && mesh.vertices[offset + 6 + axis] <= 1);
      if (vertex < mesh.robotVertexCount) assert.ok(mesh.vertices[offset + axis] >= math.ROBOT_BOUNDS.min[axis] - 0.0001 && mesh.vertices[offset + axis] <= math.ROBOT_BOUNDS.max[axis] + 0.0001, `Robot exceeds framing bounds: vertex ${vertex}, axis ${axis}`);
    }
  }
});

test("all robot bounds stay visible at every step, viewport aspect, orbit and pitch limit", () => {
  const corners = [];
  for (const x of [math.ROBOT_BOUNDS.min[0], math.ROBOT_BOUNDS.max[0]])
    for (const y of [math.ROBOT_BOUNDS.min[1], math.ROBOT_BOUNDS.max[1]])
      for (const z of [math.ROBOT_BOUNDS.min[2], math.ROBOT_BOUNDS.max[2]]) corners.push([x, y, z]);
  for (const aspect of [0.08, 0.3, 0.7, 1.4, 2.5, 5]) for (const stage of NUTRITION_STAGES) {
    for (const yaw of [stage.cameraYaw, 0, 1, 2, 3, 4, 5, 6]) for (const pitch of [-0.35, stage.cameraPitch, 0.35]) {
      const { matrix } = math.cameraMatrices({ yaw, pitch, zoom: stage.zoom }, aspect);
      for (const corner of corners) {
        const p = math.projectPoint(corner, matrix);
        assert.ok(p.visible && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1, JSON.stringify({ aspect, yaw, pitch, corner, p }));
      }
    }
  }
});

test("the actual camera gets progressively closer and interpolates via the shortest orbit", () => {
  let previous = Infinity;
  for (const stage of NUTRITION_STAGES) {
    const pose = math.cameraMatrices({ yaw: stage.cameraYaw, pitch: stage.cameraPitch, zoom: stage.zoom }, 1.4);
    assert.ok(pose.distance < previous);
    previous = pose.distance;
  }
  const start = { yaw: Math.PI - 0.1, pitch: 0, zoom: 0.64 };
  const end = { yaw: -Math.PI + 0.1, pitch: 0.1, zoom: 1 };
  const midpoint = math.easeCamera(start, end, 0.5);
  assert.ok(Math.abs(midpoint.yaw - Math.PI) < 0.0001);
  assert.ok(Math.abs(midpoint.zoom - 0.82) < 0.000001);
  assert.equal(math.easeCamera(start, end, -1).zoom, 0.64);
  assert.equal(math.easeCamera(start, end, 2).zoom, 1);
});

test("GPU drawing resolution respects its pixel budget on retina, mobile and large screens", () => {
  for (const [width, height, dpr] of [[840, 700, 2], [390, 260, 3], [3840, 2160, 2], [10000, 500, 3], [0, 0, 0], [NaN, NaN, NaN]]) {
    const size = math.drawingBufferSize(width, height, dpr);
    assert.ok(size.width > 0 && size.height > 0);
    assert.ok(size.width <= 4096 && size.height <= 4096);
    assert.ok(size.width * size.height <= 1_600_000);
  }
});

function rendererHarness({ motion = true, available = true, shaderWorks = true } = {}) {
  let now = 0;
  let id = 0;
  const frames = new Map();
  const canvasEvents = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const captures = new Set();
  const statuses = [];
  const anchors = [];
  const draws = [];
  const eyes = [];
  let deletedBuffers = 0;
  let deletedPrograms = 0;
  let deletedShaders = 0;
  let disconnected = 0;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, DEPTH_TEST: 8, COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 32, TRIANGLES: 64,
    isContextLost: () => false,
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => {}, getShaderParameter: () => shaderWorks,
    createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {}, getProgramParameter: () => true,
    createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
    getAttribLocation: () => 0, enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    getUniformLocation: () => ({}), useProgram: () => {}, enable: () => {}, clearColor: () => {},
    viewport: () => {}, clear: () => {}, uniformMatrix4fv: () => {}, uniform1f: () => {}, uniform3fv: (_, value) => eyes.push([...value]),
    drawArrays: (...args) => draws.push(args),
    deleteShader: () => deletedShaders++, deleteBuffer: () => deletedBuffers++, deleteProgram: () => deletedPrograms++,
  };
  const canvas = {
    width: 0, height: 0, dataset: {}, getContext: () => available ? gl : null,
    getBoundingClientRect: () => ({ width: 840, height: 600 }),
    addEventListener: (name, fn) => canvasEvents.set(name, fn), removeEventListener: (name) => canvasEvents.delete(name),
    setPointerCapture: (value) => captures.add(value), hasPointerCapture: (value) => captures.has(value), releasePointerCapture: (value) => captures.delete(value),
  };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: (name) => documentEvents.delete(name),
  };
  const window = {
    devicePixelRatio: 2,
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; }, cancelAnimationFrame: (value) => frames.delete(value),
    addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: (name) => windowEvents.delete(name),
  };
  const ResizeObserver = class { observe() {} disconnect() { disconnected++; } };
  const { createNutritionRobotRenderer } = load("nutrition-robot-renderer", { window, document, ResizeObserver, performance: { now: () => now } });
  const create = () => createNutritionRobotRenderer(canvas, { yaw: 0.1, pitch: 0.1, zoom: 0.64 }, motion, (value) => statuses.push(value), (x, y) => anchors.push([x, y]));
  return {
    create, canvas, frames, canvasEvents, documentEvents, windowEvents, draws, eyes, statuses, anchors, captures,
    resourceCounts: () => ({ deletedBuffers, deletedPrograms, deletedShaders, disconnected }),
    frame: (ms = 50) => { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(now)); },
    hidden: (value) => { document.hidden = value; documentEvents.get("visibilitychange")?.(); },
  };
}

test("renderer uploads the mesh, draws depth-aware robot/floor and projects the hotspot", () => {
  const h = rendererHarness();
  const r = h.create();
  assert.deepEqual(h.statuses, ["ready"]);
  assert.equal(h.draws.length, 2);
  assert.ok(h.draws[0][2] > 10_000);
  assert.ok(h.anchors.every(([x, y]) => x >= 15 && x <= 76 && y >= 15 && y <= 84));
  r.dispose();
});

test("paused/reduced-motion renderer performs no continuous animation but camera controls still work", () => {
  const h = rendererHarness({ motion: false });
  const r = h.create();
  assert.equal(h.frames.size, 0);
  const firstEye = h.eyes.at(-1);
  r.setCamera({ yaw: 0.5, pitch: 0.05, zoom: 0.8 });
  assert.notDeepEqual(h.eyes.at(-1), firstEye);
  assert.equal(h.frames.size, 0);
  r.rotateBy(0.3);
  assert.equal(h.frames.size, 0);
  r.setMotion(true);
  assert.equal(h.frames.size, 1);
  r.setMotion(false);
  assert.equal(h.frames.size, 0);
  r.dispose();
});

test("hidden tabs stop rendering and context loss recovers without losing navigation", () => {
  const h = rendererHarness();
  const r = h.create();
  h.hidden(true);
  assert.equal(h.frames.size, 0);
  const draws = h.draws.length;
  r.setCamera({ yaw: -0.55, pitch: 0.1, zoom: 0.8 });
  assert.equal(h.draws.length, draws);
  h.hidden(false);
  assert.equal(h.frames.size, 1);
  let prevented = false;
  h.canvasEvents.get("webglcontextlost")({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.statuses.at(-1), "fallback");
  assert.equal(h.frames.size, 0);
  h.canvasEvents.get("webglcontextrestored")();
  assert.equal(h.statuses.at(-1), "ready");
  assert.equal(h.frames.size, 1);
  r.dispose();
});

test("dragging and focused keyboard orbit controls change the real camera", () => {
  const h = rendererHarness({ motion: false });
  const r = h.create();
  const firstEye = h.eyes.at(-1);
  h.canvasEvents.get("pointerdown")({ isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(h.canvas.dataset.dragging, "true");
  h.canvasEvents.get("pointermove")({ pointerId: 1, clientX: 90, clientY: 20 });
  assert.notDeepEqual(h.eyes.at(-1), firstEye);
  h.canvasEvents.get("pointerup")();
  assert.equal(h.captures.size, 0);
  assert.equal(h.canvas.dataset.dragging, undefined);
  let prevented = false;
  h.canvasEvents.get("keydown")({ key: "Home", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(h.eyes.at(-1), firstEye);
  r.dispose();
});

test("leaving the page releases GPU objects, observers, listeners and RAF callbacks", () => {
  const h = rendererHarness();
  const r = h.create();
  h.frame();
  r.dispose();
  for (const collection of [h.frames, h.canvasEvents, h.documentEvents, h.windowEvents]) assert.equal(collection.size, 0);
  assert.deepEqual(h.resourceCounts(), { deletedBuffers: 1, deletedPrograms: 1, deletedShaders: 2, disconnected: 1 });
});

test("WebGL and shader failures reject cleanly without scheduling a render loop", () => {
  for (const options of [{ available: false }, { shaderWorks: false }]) {
    const h = rendererHarness(options);
    assert.throws(h.create);
    assert.equal(h.frames.size, 0);
    assert.equal(h.canvasEvents.size, 0);
    assert.equal(h.documentEvents.size, 0);
    assert.equal(h.windowEvents.size, 0);
  }
});
