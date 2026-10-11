"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShimmer } from "@/components/admin-shimmer";

type ViewerFormat = "stl" | "obj" | "glb";

function ViewerIcon({ kind }: { kind: "fit" | "reset" | "fullscreen" | "help" }) {
  if (kind === "fit")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4M8 8l8 8M16 8l-8 8" />
      </svg>
    );
  if (kind === "reset")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v6h6" />
      </svg>
    );
  if (kind === "help")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.75 9a2.35 2.35 0 1 1 3.72 1.91c-.94.7-1.47 1.16-1.47 2.34M12 16.9h.01" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
    </svg>
  );
}

export function DesignModelViewer({
  fileId,
  format,
  hasThumbnail,
}: {
  fileId: string;
  format: ViewerFormat;
  hasThumbnail: boolean;
}) {
  const shell = useRef<HTMLElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const resetView = useRef<(() => void) | null>(null);
  const fitView = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    void shell.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    let cleanup = () => undefined;
    void (async () => {
      try {
        const [
          {
            AmbientLight,
            Box3,
            Color,
            DirectionalLight,
            MOUSE,
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
            import("three/examples/jsm/loaders/DRACOLoader.js"),
          ]),
        ]);
        if (disposed) return;
        const [stl, obj, gltf, draco] = loaders;
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
        renderer.setSize(container.clientWidth, container.clientHeight, false);
        container.replaceChildren(renderer.domElement);
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute(
          "aria-label",
          "Model 3D interaktif. Tarik untuk memutar, Shift dan tarik untuk menggeser, scroll untuk zoom.",
        );
        scene.add(new AmbientLight(0xffffff, 1.7));
        const directional = new DirectionalLight(0xffffff, 2.2);
        directional.position.set(3, 4, 5);
        scene.add(directional);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.mouseButtons.LEFT = MOUSE.ROTATE;
        controls.minDistance = 0.05;
        controls.maxDistance = 100000;
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
          const dracoLoader = new draco.DRACOLoader();
          dracoLoader.setDecoderPath("/api/admin/three/draco/");
          const gltfLoader = new gltf.GLTFLoader();
          gltfLoader.setDRACOLoader(dracoLoader);
          model = (await gltfLoader.loadAsync(source)).scene;
          cleanup = () => {
            dracoLoader.dispose();
          };
        }
        if (disposed) return;
        scene.add(model);
        const bounds = new Box3().setFromObject(model);
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        model.position.sub(center);
        const distance = Math.max(size.x, size.y, size.z, 1) * 1.8;
        const homePosition = new Vector3(distance, distance * 0.65, distance);
        const frameModel = () => {
          camera.position.copy(homePosition);
          controls.target.set(0, 0, 0);
          controls.update();
        };
        frameModel();
        resetView.current = frameModel;
        fitView.current = frameModel;
        const resetPointerMode = () => {
          controls.mouseButtons.LEFT = MOUSE.ROTATE;
        };
        const onPointerDown = (event: PointerEvent) => {
          if (event.button === 0 && event.shiftKey) controls.mouseButtons.LEFT = MOUSE.PAN;
        };
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            setHelpOpen(false);
            if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
            return;
          }
          if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            frameModel();
            return;
          }
          if (event.key.toLowerCase() === "r") {
            event.preventDefault();
            frameModel();
            return;
          }
          if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          camera.updateMatrixWorld();
          const amount = Math.max(size.x, size.y, size.z, 1) * 0.06;
          const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
          const offset = new Vector3();
          if (event.key === "ArrowLeft") offset.addScaledVector(right, -amount);
          if (event.key === "ArrowRight") offset.addScaledVector(right, amount);
          if (event.key === "ArrowUp") offset.addScaledVector(up, amount);
          if (event.key === "ArrowDown") offset.addScaledVector(up, -amount);
          camera.position.add(offset);
          controls.target.add(offset);
          controls.update();
        };
        renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
        renderer.domElement.addEventListener("pointerup", resetPointerMode, true);
        renderer.domElement.addEventListener("pointercancel", resetPointerMode, true);
        renderer.domElement.addEventListener("keydown", onKeyDown);
        const resize = () => {
          const width = Math.max(1, container.clientWidth);
          const height = Math.max(1, container.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        const onFullscreenChange = () => {
          requestAnimationFrame(() => requestAnimationFrame(resize));
        };
        document.addEventListener("fullscreenchange", onFullscreenChange);
        let frame = 0;
        let visible = true;
        const visibilityObserver = new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
        });
        visibilityObserver.observe(container);
        const render = () => {
          if (visible && !document.hidden) {
            controls.update();
            renderer.render(scene, camera);
          }
          frame = requestAnimationFrame(render);
        };
        render();
        setLoading(false);
        if (!hasThumbnail) {
          renderer.render(scene, camera);
          renderer.domElement.toBlob(
            async (blob) => {
              if (!blob || disposed) return;
              const formData = new FormData();
              formData.set("thumbnail", new File([blob], "preview.webp", { type: "image/webp" }));
              await fetch(`/api/admin/design-files/${fileId}/thumbnail`, { method: "POST", body: formData }).catch(
                () => undefined,
              );
            },
            "image/webp",
            0.82,
          );
        }
        const releaseRenderer = cleanup;
        cleanup = () => {
          releaseRenderer();
          cancelAnimationFrame(frame);
          observer.disconnect();
          document.removeEventListener("fullscreenchange", onFullscreenChange);
          visibilityObserver.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
          renderer.domElement.removeEventListener("pointerup", resetPointerMode, true);
          renderer.domElement.removeEventListener("pointercancel", resetPointerMode, true);
          renderer.domElement.removeEventListener("keydown", onKeyDown);
          controls.dispose();
          scene.traverse((node: import("three").Object3D) => {
            const mesh = node as import("three").Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => material?.dispose());
          });
          renderer.dispose();
          container.replaceChildren();
          resetView.current = null;
          fitView.current = null;
        };
      } catch (viewerError) {
        if (!disposed) {
          setLoading(false);
          const detail = viewerError instanceof Error ? viewerError.message : "";
          setError(
            detail.includes("DRACO")
              ? "Model memakai kompresi Draco, tetapi decoder belum dapat dimuat. Muat ulang halaman atau unduh file untuk memeriksa sumbernya."
              : "Preview belum dapat dibuka di perangkat ini. Unduh file untuk memeriksa sumbernya.",
          );
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [fileId, format, hasThumbnail]);

  if (error) return <p className="empty-copy design-viewer__error">{error}</p>;
  return (
    <section ref={shell} className="design-viewer-shell" aria-busy={loading} aria-label="Preview desain 3D">
      <div className="design-viewer" ref={mount} aria-label="Model 3D interaktif" />
      {loading ? <AdminShimmer className="design-viewer__shimmer" /> : null}
      <div className="design-viewer__toolbar" aria-label="Kontrol preview 3D">
        <button
          type="button"
          onClick={() => fitView.current?.()}
          disabled={loading}
          aria-label="Sesuaikan tampilan"
          title="Sesuaikan tampilan"
        >
          <ViewerIcon kind="fit" />
        </button>
        <button
          type="button"
          onClick={() => resetView.current?.()}
          disabled={loading}
          aria-label="Reset posisi"
          title="Reset posisi"
        >
          <ViewerIcon kind="reset" />
        </button>
        <button type="button" onClick={fullscreen} disabled={loading} aria-label="Layar penuh" title="Layar penuh">
          <ViewerIcon kind="fullscreen" />
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setHelpOpen(false);
            }
          }}
          disabled={loading}
          aria-label="Bantuan navigasi model"
          aria-expanded={helpOpen}
          title="Bantuan navigasi"
        >
          <ViewerIcon kind="help" />
        </button>
      </div>
      {helpOpen ? (
        <div className="design-viewer__shortcuts" role="tooltip">
          <strong>Navigasi model</strong>
          <span>Tarik: putar · Shift + tarik: geser</span>
          <span>Scroll/cubit: zoom · Shift + ↑↓←→: geser</span>
          <span>F: sesuaikan · R: reset · Esc: tutup bantuan/layar penuh</span>
        </div>
      ) : null}
      <p className="design-viewer__hint">Tarik putar · Shift + tarik geser · scroll/cubit zoom</p>
    </section>
  );
}
