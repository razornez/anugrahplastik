export type ChartLabel = { id: string; text: string; x: number; y: number; slot: number };

// Coordinates match CSS pixels; displaced labels stay connected to their point.
export function placeAdsChartLabels(labels: ChartLabel[], width: number, height: number) {
  const placed: (ChartLabel & { labelX: number; labelY: number; textWidth: number })[] = [];
  for (const label of [...labels].sort((a, b) => a.y - b.y || a.x - b.x || a.slot - b.slot)) {
    const textWidth = label.text.length * 7.5 + 8;
    const labelX = Math.max(textWidth / 2 + 2, Math.min(width - textWidth / 2 - 2, label.x));
    const baseY = Math.max(18, label.y - 12);
    const candidates = [baseY];
    for (let offset = 20; offset < height; offset += 20) candidates.push(baseY + offset, baseY - offset);
    const labelY = candidates.find(
      (y) =>
        y >= 18 &&
        y <= height - 8 &&
        placed.every(
          (other) =>
            Math.abs(y - other.labelY) >= 19 ||
            Math.abs(labelX - other.labelX) >= (textWidth + other.textWidth) / 2 + 4,
        ),
    );
    if (labelY !== undefined) placed.push({ ...label, labelX, labelY, textWidth });
  }
  return placed;
}
