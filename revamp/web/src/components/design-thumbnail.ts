"use client";

type PreviewFormat = "stl" | "obj" | "glb";

function previewFormat(file: File): PreviewFormat | null {
  const format = file.name.split(".").pop()?.toLowerCase();
  return format === "stl" || format === "obj" || format === "glb" ? format : null;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Preview gambar tidak dapat dibuat."))),
      "image/webp",
      0.82,
    );
  });
}

export async function createDesignThumbnail(file: File): Promise<File | null> {
  const format = previewFormat(file);
  if (!format) return null;
  const url = URL.createObjectURL(file);
  try {
    const [three, { GLTFLoader }, { OBJLoader }, { STLLoader }, { DRACOLoader }] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/loaders/OBJLoader.js"),
      import("three/examples/jsm/loaders/STLLoader.js"),
      import("three/examples/jsm/loaders/DRACOLoader.js"),
    ]);
    const scene = new three.Scene();
    scene.background = new three.Color("#f4f8fc");
    const camera = new three.PerspectiveCamera(42, 4 / 3, 0.01, 10000);
    const renderer = new three.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(360, 270, false);
    scene.add(new three.AmbientLight(0xffffff, 1.7));
    const light = new three.DirectionalLight(0xffffff, 2.2);
    light.position.set(3, 4, 5);
    scene.add(light);
    const draco = new DRACOLoader();
    let model: import("three").Object3D;
    if (format === "stl") {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      model = new three.Mesh(
        geometry,
        new three.MeshStandardMaterial({ color: "#1767d1", metalness: 0.18, roughness: 0.48 }),
      );
    } else if (format === "obj") {
      model = await new OBJLoader().loadAsync(url);
      model.traverse((node: import("three").Object3D) => {
        const mesh = node as import("three").Mesh;
        if (mesh.isMesh)
          mesh.material = new three.MeshStandardMaterial({ color: "#1767d1", metalness: 0.18, roughness: 0.48 });
      });
    } else {
      draco.setDecoderPath("/api/admin/three/draco/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      model = (await loader.loadAsync(url)).scene;
    }
    scene.add(model);
    const bounds = new three.Box3().setFromObject(model);
    const size = bounds.getSize(new three.Vector3());
    model.position.sub(bounds.getCenter(new three.Vector3()));
    const distance = Math.max(size.x, size.y, size.z, 1) * 1.8;
    camera.position.set(distance, distance * 0.65, distance);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const blob = await canvasBlob(renderer.domElement);
    model.traverse((node: import("three").Object3D) => {
      const mesh = node as import("three").Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material?.dispose());
    });
    draco.dispose();
    renderer.dispose();
    return new File([blob], "preview.webp", { type: "image/webp" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
