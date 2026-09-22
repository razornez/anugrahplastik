type TrendPoint = { date: string; sessions: number; forms: number };

function pointsFor(values: number[], maximum: number, width: number, height: number) {
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maximum) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AnalyticsTrendChart({ points }: { points: TrendPoint[] }) {
  const maximum = Math.max(1, ...points.flatMap((point) => [point.sessions, point.forms]));
  const width = 640;
  const height = 180;
  return (
    <figure className="traffic-chart" aria-labelledby="traffic-chart-title">
      <figcaption>
        <div>
          <p className="eyebrow">Pergerakan harian</p>
          <h2 id="traffic-chart-title">Kunjungan dan formulir</h2>
        </div>
        <span className="chart-legend">
          <i /> Pengunjung <i /> Form masuk
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik pengunjung dan formulir per hari">
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} />
        ))}
        <polyline
          className="traffic-chart__sessions"
          points={pointsFor(
            points.map((point) => point.sessions),
            maximum,
            width,
            height,
          )}
        />
        <polyline
          className="traffic-chart__forms"
          points={pointsFor(
            points.map((point) => point.forms),
            maximum,
            width,
            height,
          )}
        />
      </svg>
      <div className="traffic-chart__dates" aria-hidden="true">
        <span>{points[0]?.date.slice(5) ?? "—"}</span>
        <span>{points[Math.floor(points.length / 2)]?.date.slice(5) ?? "—"}</span>
        <span>{points.at(-1)?.date.slice(5) ?? "—"}</span>
      </div>
    </figure>
  );
}
