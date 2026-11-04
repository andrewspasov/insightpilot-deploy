import { cameraMatrices, clamp, drawingBufferSize, easeCamera, projectPoint, TABLET_ANCHOR, type CameraState } from "./nutrition-3d-math";
import { buildNutritionRobotMesh, VERTEX_STRIDE } from "./nutrition-robot-mesh";

export type RobotRenderStatus = "ready" | "fallback";
export type RobotRenderer = {
  setCamera: (state: CameraState) => void;
  setMotion: (active: boolean) => void;
  rotateBy: (angle: number) => void;
  resetOrbit: () => void;
  dispose: () => void;
};

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec3 aSurface;
uniform mat4 uCamera;
uniform float uBob;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vSurface;
void main() {
  vPosition = aPosition + vec3(0.0, uBob, 0.0);
  vNormal = aNormal;
  vColor = aColor;
  vSurface = aSurface;
  gl_Position = uCamera * vec4(vPosition, 1.0);
}`;

const fragmentShader = `
precision mediump float;
uniform vec3 uEye;
uniform float uTime;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vSurface;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(uEye - vPosition);
  vec3 key = normalize(vec3(-3.0, 6.0, 5.0) - vPosition);
  vec3 fill = normalize(vec3(4.0, 3.0, -3.0) - vPosition);
  float diffuse = max(dot(n, key), 0.0);
  float blue = max(dot(n, fill), 0.0);
  float specular = pow(max(dot(n, normalize(key + view)), 0.0), mix(100.0, 12.0, vSurface.x));
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  vec3 color = vColor * (0.17 + diffuse * 0.95);
  color += vec3(0.03, 0.2, 0.3) * blue;
  color += mix(vec3(0.24), vColor, vSurface.y) * specular * 1.1;
  color += vec3(0.02, 0.19, 0.26) * rim;
  color += vColor * vSurface.z * (1.1 + 0.08 * sin(uTime * 1.5));
  color = color / (color + vec3(1.0));
  gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}`;

export function createNutritionRobotRenderer(
  canvas: HTMLCanvasElement,
  initialCamera: CameraState,
  initialMotion: boolean,
  onStatus: (status: RobotRenderStatus) => void,
  onAnchor: (x: number, y: number) => void,
): RobotRenderer {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!gl || gl.isContextLost()) throw new Error("WebGL is unavailable");
  const mesh = buildNutritionRobotMesh();
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let current = { ...initialCamera };
  let baseCamera = { ...initialCamera };
  let target = { ...initialCamera };
  let from = { ...initialCamera };
  let transitionStart = 0;
  let transitioning = false;
  let motion = initialMotion;
  let frame = 0;
  let lastPaint = 0;
  let lastTime = 0;
  let elapsed = 0;
  let hiddenAt = 0;
  let disposed = false;
  let lost = false;
  let drag: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;

  const releaseResources = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    buffer = null;
    program = null;
  };
  const initialize = () => {
    const shaders: WebGLShader[] = [];
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Robot shader compilation failed");
      }
      program = gl.createProgram();
      if (!program) throw new Error("Program allocation failed");
      shaders.forEach((shader) => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Robot shader linking failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Mesh allocation failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      ["aPosition", "aNormal", "aColor", "aSurface"].forEach((name, index) => {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) throw new Error("Robot shader attribute is missing");
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 3, gl.FLOAT, false, VERTEX_STRIDE * 4, index * 3 * 4);
      });
      uniforms = Object.fromEntries(["uCamera", "uBob", "uEye", "uTime"].map((name) => [name, gl.getUniformLocation(program, name)]));
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
    } catch (error) {
      releaseResources();
      throw error;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  };

  const paint = () => {
    if (disposed || lost || !program || document.hidden) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const { width, height } = drawingBufferSize(bounds.width, bounds.height, window.devicePixelRatio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const camera = cameraMatrices(current, bounds.width / bounds.height);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uCamera, false, camera.matrix);
    gl.uniform3fv(uniforms.uEye, camera.eye);
    gl.uniform1f(uniforms.uTime, elapsed);
    gl.uniform1f(uniforms.uBob, motion ? Math.sin(elapsed * 1.1) * 0.008 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.robotVertexCount);
    gl.uniform1f(uniforms.uBob, 0);
    gl.drawArrays(gl.TRIANGLES, mesh.robotVertexCount, mesh.vertices.length / VERTEX_STRIDE - mesh.robotVertexCount);
    const anchor = projectPoint(TABLET_ANCHOR, camera.matrix);
    onAnchor(clamp((anchor.x + 1) * 50, 15, 76), clamp((1 - anchor.y) * 50, 15, 84));
  };
  const stop = () => { window.cancelAnimationFrame(frame); frame = 0; };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || lost || !motion || document.hidden) return;
    elapsed += Math.min(Math.max(now - lastTime, 0), 50) / 1000;
    lastTime = now;
    if (transitioning) {
      const progress = (now - transitionStart) / 1400;
      current = easeCamera(from, target, progress);
      if (progress >= 1) { current = { ...target }; transitioning = false; }
    }
    if (transitioning || now - lastPaint >= 1000 / 30) { paint(); lastPaint = now; }
    frame = window.requestAnimationFrame(tick);
  };
  const resume = () => {
    if (!frame && !disposed && !lost && motion && !document.hidden) { lastTime = performance.now(); frame = window.requestAnimationFrame(tick); }
  };
  const animateTo = (state: CameraState) => {
    from = { ...current };
    target = { ...state, pitch: clamp(state.pitch, -0.35, 0.35) };
    transitionStart = performance.now();
    transitioning = motion && !document.hidden;
    if (!transitioning) { current = { ...target }; paint(); }
    resume();
  };
  const resize = () => paint();
  const visibilityChanged = () => {
    if (document.hidden) { hiddenAt = performance.now(); stop(); }
    else {
      if (transitioning) transitionStart += performance.now() - hiddenAt;
      paint();
      resume();
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if (lost || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: current.yaw, pitch: current.pitch };
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
  };
  const pointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    transitioning = false;
    current = { ...current, yaw: drag.yaw - (event.clientX - drag.x) * 0.008, pitch: clamp(drag.pitch + (event.clientY - drag.y) * 0.004, -0.35, 0.35) };
    target = { ...current };
    paint();
  };
  const pointerUp = () => {
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    delete canvas.dataset.dragging;
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") animateTo(baseCamera);
    else animateTo({ ...target, yaw: target.yaw + (event.key === "ArrowLeft" ? -0.25 : event.key === "ArrowRight" ? 0.25 : 0), pitch: target.pitch + (event.key === "ArrowUp" ? 0.08 : event.key === "ArrowDown" ? -0.08 : 0) });
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    pointerUp();
    stop();
    onStatus("fallback");
  };
  const contextRestored = () => {
    if (disposed) return;
    try {
      releaseResources();
      initialize();
      lost = false;
      current = { ...target };
      transitioning = false;
      paint();
      onStatus("ready");
      resume();
    } catch { onStatus("fallback"); }
  };

  initialize();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("lostpointercapture", pointerUp);
  canvas.addEventListener("keydown", keyDown);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("resize", resize);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  paint();
  onStatus("ready");
  resume();

  return {
    setCamera: (state) => { baseCamera = { ...state }; pointerUp(); animateTo(state); },
    setMotion: (active) => {
      motion = active;
      if (!motion) { stop(); current = { ...target }; transitioning = false; }
      paint();
      resume();
    },
    rotateBy: (angle) => animateTo({ ...target, yaw: target.yaw + angle }),
    resetOrbit: () => animateTo(baseCamera),
    dispose: () => {
      disposed = true;
      stop();
      pointerUp();
      observer?.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("lostpointercapture", pointerUp);
      canvas.removeEventListener("keydown", keyDown);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("resize", resize);
      releaseResources();
    },
  };
}
