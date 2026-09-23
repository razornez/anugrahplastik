"use client";

import { useEffect, useRef, useState } from "react";

type ViewerFormat = "stl" | "obj" | "glb";

export function DesignModelViewer({ fileId, format }: { fileId: string; format: ViewerFormat }) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => undefined;
    void (async () => {
      try {
        const [
          {
            AmbientLight,
            Box3,
            Color,
            DirectionalLight,
            Mesh,
            MeshStandardMaterial,
            PerspectiveCamera,
            Scene,
            Vector3,
            WebGLRenderer,
          },
          { OrbitControls },
          loaders,
        ] = await Promise.all([
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          Promise.all([
            import("three/examples/jsm/loaders/STLLoader.js"),
            import("three/examples/jsm/loaders/OBJLoader.js"),
            import("three/examples/jsm/loaders/GLTFLoader.js"),
          ]),
        ]);
        if (disposed) return;
        const [stl, obj, gltf] = loaders;
        const scene = new Scene();
        scene.background = new Color("#f4f8fc");
        const camera = new PerspectiveCamera(
          42,
          Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
          0.01,
          10000,
        );
        const renderer = new WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.replaceChildren(renderer.domElement);
        scene.add(new AmbientLight(0xffffff, 1.7));
        const directional = new DirectionalLight(0xffffff, 2.2);
        directional.position.set(3, 4, 5);
        scene.add(directional);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 0, 0);
        let model: import("three").Object3D;
        const source = `/api/admin/design-files/${fileId}`;
        if (format === "stl") {
          const geometry = await new stl.STLLoader().loadAsync(source);
          geometry.computeVertexNormals();
          model = new Mesh(geometry, new MeshStandardMaterial({ color: "#1767d1", metalness: 0.18, roughness: 0.48 }));
        } else if (format === "obj") {
          model = await new obj.OBJLoader().loadAsync(source);
          model.traverse((node: import("three").Object3D) => {
            const mesh = node as import("three").Mesh;
            if (mesh.isMesh)
              mesh.material = new MeshStandardMaterial({ color: "#1767d1", metalness: 0.18, roughness: 0.48 });
          });
        } else {
          model = (await new gltf.GLTFLoader().loadAsync(source)).scene;
        }
        if (disposed) return;
        scene.add(model);
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        model.position.sub(center);
        const distance = Math.max(size.x, size.y, size.z, 1) * 1.8;
        camera.position.set(distance, distance * 0.65, distance);
        controls.update();
        const resize = () => {
          const width = Math.max(1, container.clientWidth);
          const height = Math.max(1, container.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        let frame = 0;
        const render = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        render();
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          controls.dispose();
          renderer.dispose();
          container.replaceChildren();
        };
      } catch {
        if (!disposed) setError("Preview belum dapat dibuka. Unduh file untuk memeriksa sumbernya.");
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [fileId, format]);

  if (error) return <p className="empty-copy">{error}</p>;
  return <div className="design-viewer" ref={mount} aria-label="Preview desain 3D" />;
}
