import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
export default function Planet() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(
        42,
        innerWidth / innerHeight,
        0.1,
        200,
      );
    camera.position.z = 8;
    scene.add(new THREE.AmbientLight(0x8babc1, 2));
    const sun = new THREE.DirectionalLight(0xbadfff, 3.5);
    sun.position.set(-5, 4, 5);
    scene.add(sun);
    const world = new THREE.Group(),
      planet = new THREE.Group();
    planet.rotation.z = 0.37;
    world.add(planet);
    scene.add(world);
    let disposed = false;
    const release = (object: THREE.Object3D) =>
      object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          mats.forEach((mat) => {
            Object.values(mat).forEach((v) => {
              if (v instanceof THREE.Texture) v.dispose();
            });
            mat.dispose();
          });
        }
      });
    const draco = new DRACOLoader();
    draco.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.5/",
    );
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load(
      "https://api.getlayers.ai/storage/v1/object/public/public/assets/ascend-d9857ad1f2/planet.glb",
      (gltf) => {
        if (disposed) {
          release(gltf.scene);
          return;
        }
        const box = new THREE.Box3().setFromObject(gltf.scene);
        gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
        const normalized = new THREE.Group();
        normalized.add(gltf.scene);
        normalized.scale.setScalar(
          3.9 / Math.max(...box.getSize(new THREE.Vector3()).toArray()),
        );
        planet.add(normalized);
      },
      undefined,
      () => {
        container.dataset.failed = "true";
      },
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(2.04, 64, 40),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader:
          "varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "varying vec3 n;varying vec3 v;void main(){float a=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.12,.42,.85,a*.65);}",
      }),
    );
    world.add(halo);
    const positions = new Float32Array(1800);
    for (let i = 0; i < positions.length; i++)
      positions[i] = (Math.random() - 0.5) * 85;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xc4dacf,
          size: 0.045,
          transparent: true,
          opacity: 0.65,
        }),
      ),
    );
    const resize = () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0,
      rotation = 2.07,
      progress = 0,
      previous = performance.now();
    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const target =
        scrollY /
        Math.max(1, document.documentElement.scrollHeight - innerHeight);
      progress += (target - progress) * Math.min(1, dt * 4.5);
      const mobile = innerWidth < 700;
      world.position.set(
        Math.sin(progress * Math.PI * 2) * -2.1 * (mobile ? 0.35 : 1),
        -3 + progress * 3.2,
        0,
      );
      world.scale.setScalar(
        (mobile ? 1.3 : 1.85) - Math.sin(progress * Math.PI) * 0.95,
      );
      if (!reduced) rotation += dt * 0.03;
      planet.rotation.y = rotation + progress * Math.PI * 1.6;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      release(scene);
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={host} className="ip-planet" aria-hidden="true" />;
}
