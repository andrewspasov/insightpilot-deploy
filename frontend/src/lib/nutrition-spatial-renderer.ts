import { drawingBufferSize, lookAt, multiplyMatrices, perspective } from "./nutrition-3d-math";

const vertexSource = `
attribute vec3 a_position;
attribute vec3 a_color;
attribute float a_size;
uniform mat4 u_camera;
uniform float u_time;
uniform float u_ratio;
varying vec3 v_color;
varying float v_fade;
void main() {
  vec3 p = a_position;
  p.y += sin(u_time * 0.35 + p.x * 2.0 + p.z) * 0.08;
  gl_Position = u_camera * vec4(p, 1.0);
  gl_PointSize = clamp(a_size * u_ratio * 28.0 / max(gl_Position.w, 1.0), 1.0, 9.0);
  v_color = a_color;
  v_fade = clamp(1.0 - gl_Position.w / 45.0, 0.0, 1.0);
}`;
const fragmentSource = `
precision mediump float;
uniform float u_points;
varying vec3 v_color;
varying float v_fade;
void main() {
  float glow = 0.22;
  if (u_points > 0.5) {
    float radius = length(gl_PointCoord - vec2(0.5));
    glow = (1.0 - smoothstep(0.05, 0.5, radius)) * 0.6;
  }
  gl_FragColor = vec4(v_color, glow * v_fade);
}`;

export function buildNutritionSpatialField() {
  const vertices: number[] = [];
  let seed = 719;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let index = 0; index < 1100; index++) {
    const amber = index % 11 === 0;
    const color = amber ? [0.9, 0.65, 0.3] : [0.25, 0.8, 0.88];
    vertices.push((random() - 0.5) * 28, (random() - 0.5) * 16, -random() * 25 + 4, ...color, random() * 1.5 + 0.8);
  }
  const particleCount = vertices.length / 7;
  for (let ring = 0; ring < 3; ring++) {
    for (let segment = 0; segment < 160; segment++) {
      for (const t of [segment / 160, (segment + 1) / 160]) {
        const angle = t * Math.PI * 2;
        const radius = 2.8 + ring * 0.6;
        vertices.push(4 + Math.sin(angle) * radius, Math.cos(angle) * radius * (ring === 1 ? 0.25 : 1), -5 + Math.cos(angle) * radius * 0.6 + ring, 0.15, 0.7, 0.8, 1);
      }
    }
  }
  return { vertices: new Float32Array(vertices), particleCount, lineCount: vertices.length / 7 - particleCount };
}

export function createNutritionSpatialRenderer(canvas: HTMLCanvasElement, page: HTMLDivElement, motionActive: boolean) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) throw new Error("WebGL unavailable");
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const release = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((shader) => gl.deleteShader(shader));
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Shader allocation failed");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
    return shader;
  };
  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader link failed");
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Buffer allocation failed");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const field = buildNutritionSpatialField();
    gl.bufferData(gl.ARRAY_BUFFER, field.vertices, gl.STATIC_DRAW);
    for (const [name, size, offset] of [["a_position", 3, 0], ["a_color", 3, 12], ["a_size", 1, 24]] as const) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
    }
    const uniforms = { camera: gl.getUniformLocation(program, "u_camera"), time: gl.getUniformLocation(program, "u_time"), ratio: gl.getUniformLocation(program, "u_ratio"), points: gl.getUniformLocation(program, "u_points") };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    let disposed = false;
    let frame = 0;
    let lastDraw = -Infinity;
    let time = 0;
    const draw = () => {
      if (disposed || document.hidden || gl.isContextLost()) return;
      const box = canvas.getBoundingClientRect();
      const size = drawingBufferSize(box.width, box.height, window.devicePixelRatio);
      if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height; }
      gl.viewport(0, 0, size.width, size.height);
      const progress = Math.max(0, Math.min(5, Number(page.dataset.scenePosition) || 0));
      const yaw = (progress / 5 - 0.5) * 0.45;
      const camera = multiplyMatrices(perspective(size.width / size.height), lookAt([Math.sin(yaw) * 6, Math.sin(progress * 0.8) * 0.45, 12 - progress], [1, 0, -6]));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniformMatrix4fv(uniforms.camera, false, camera);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.ratio, size.width / Math.max(box.width, 1));
      gl.uniform1f(uniforms.points, 1);
      gl.drawArrays(gl.POINTS, 0, field.particleCount);
      gl.uniform1f(uniforms.points, 0);
      gl.drawArrays(gl.LINES, field.particleCount, field.lineCount);
    };
    const animate = (timestamp: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      if (timestamp - lastDraw >= 1000 / 30) {
        if (Number.isFinite(lastDraw)) time += Math.min(timestamp - lastDraw, 100) / 1000;
        lastDraw = timestamp;
        draw();
      }
      frame = window.requestAnimationFrame(animate);
    };
    const visibility = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastDraw = -Infinity;
      if (!document.hidden) { draw(); if (motionActive) frame = window.requestAnimationFrame(animate); }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    page.addEventListener("nutrition-scene-frame", draw);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        page.removeEventListener("nutrition-scene-frame", draw);
        document.removeEventListener("visibilitychange", visibility);
        release();
      },
    };
  } catch (error) { release(); throw error; }
}
