export async function readPublicContentOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
  resource: string,
): Promise<T> {
  try {
    return await loader();
  } catch {
    if (process.env.NODE_ENV !== "test")
      console.warn(`[public-content] ${resource} tidak dapat dibaca; menggunakan konten bawaan.`);
    return fallback;
  }
}
