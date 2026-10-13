type TrendPoint = { date: string; sessions: number; forms: number };

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(
    new Date(`${date}T12:00:00+07:00`),
  );
}

function groupedPoints(points: TrendPoint[]) {
  if (points.length <= 7) return points.map((point) => ({ ...point, label: dateLabel(point.date) }));
  const groups: Array<TrendPoint & { label: string }> = [];
  for (let index = 0; index < points.length; index += 7) {
    const week = points.slice(index, index + 7);
    groups.push({
      date: week[0].date,
      label: `${dateLabel(week[0].date)} sampai ${dateLabel(week.at(-1)!.date)}`,
      sessions: week.reduce((sum, point) => sum + point.sessions, 0),
      forms: week.reduce((sum, point) => sum + point.forms, 0),
    });
  }
  return groups;
}

export function AnalyticsTrendChart({ points }: { points: TrendPoint[] }) {
  const hasData = points.some((point) => point.sessions > 0 || point.forms > 0);
  const groups = groupedPoints(points);
  const maximum = Math.max(1, ...groups.map((point) => point.sessions));
  const totalSessions = points.reduce((sum, point) => sum + point.sessions, 0);
  const totalForms = points.reduce((sum, point) => sum + point.forms, 0);

  return (
    <figure className="traffic-chart traffic-chart--direct" aria-labelledby="traffic-chart-title">
      <figcaption>
        <div>
          <p className="eyebrow">Kunjungan website</p>
          <h2 id="traffic-chart-title">Kunjungan dan permintaan</h2>
        </div>
      </figcaption>
      {!hasData ? (
        <p className="home-empty">Belum ada kunjungan yang tercatat pada periode ini.</p>
      ) : points.length === 1 ? (
        <div className="traffic-chart__today">
          <div>
            <strong>{totalSessions.toLocaleString("id-ID")}</strong>
            <span>kunjungan hari ini</span>
          </div>
          <div>
            <strong>{totalForms.toLocaleString("id-ID")}</strong>
            <span>permintaan valid hari ini</span>
          </div>
        </div>
      ) : (
        <>
          <p className="traffic-chart__note">
            {points.length > 7 ? "Jumlah per minggu; rincian setiap hari ada di tabel." : "Jumlah per hari."}
          </p>
          <div
            className="traffic-chart__bars"
            role="group"
            aria-label="Jumlah kunjungan dan permintaan menurut tanggal"
          >
            {groups.map((point) => (
              <div className="traffic-chart__group" key={point.date}>
                <div className="traffic-chart__value">
                  <strong>{point.sessions}</strong>
                  <span>kunjungan</span>
                </div>
                <div className="traffic-chart__bar-track" aria-hidden="true">
                  <span style={{ height: `${Math.max(5, (point.sessions / maximum) * 100)}%` }} />
                </div>
                <div className="traffic-chart__form">
                  <strong>{point.forms}</strong> permintaan
                </div>
                <time dateTime={point.date}>{point.label}</time>
              </div>
            ))}
          </div>
          {points.length > 7 ? (
            <details className="traffic-chart__daily" open>
              <summary>
                Rincian harian · {totalSessions} kunjungan, {totalForms} permintaan
              </summary>
              <div className="traffic-chart__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Tanggal</th>
                      <th scope="col">Kunjungan</th>
                      <th scope="col">Permintaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.date}>
                        <th scope="row">{dateLabel(point.date)}</th>
                        <td>{point.sessions}</td>
                        <td>{point.forms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </figure>
  );
}
