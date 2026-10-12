import type { VisitorCohorts } from "@/features/analytics/visitor-cohorts";

const integer = new Intl.NumberFormat("id-ID");
const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const fullDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function dateAtJakartaMidnight(date: string) {
  return new Date(`${date}T00:00:00+07:00`);
}

function chartPath(values: number[], maximum: number) {
  return values
    .map((value, index) => {
      const x = (index * 1000) / Math.max(1, values.length - 1);
      const y = 880 - (value * 700) / maximum;
      return `${index ? "L" : "M"} ${x} ${y}`;
    })
    .join(" ");
}

function labeledIndexes(values: number[], days: 7 | 30) {
  const visible = values.flatMap((value, index) => (value > 0 ? [index] : []));
  if (days === 7 || visible.length < 2) return new Set(visible);
  const peak = Math.max(...values);
  return new Set([values.findIndex((value) => value === peak), visible.at(-1)!]);
}

export function GrowthVisitorChart({ data }: { data: VisitorCohorts }) {
  const maximum = Math.max(1, ...data.trend.flatMap((day) => [day.newVisitors, day.returningVisitors]));
  const hasVisitors = data.trend.some((day) => day.newVisitors > 0 || day.returningVisitors > 0);
  const first = data.trend[0]?.date;
  const last = data.trend.at(-1)?.date;
  const dateTicks = data.days === 7 ? data.trend.map((_, index) => index) : [0, 7, 14, 21, 29];
  const series = [
    { key: "newVisitors", className: "new" },
    { key: "returningVisitors", className: "returning" },
  ] as const;

  return (
    <div className="growth-visitor-chart">
      <p className="growth-visitor-chart__range">
        {first && last
          ? `${fullDate.format(dateAtJakartaMidnight(first))} sampai ${fullDate.format(dateAtJakartaMidnight(last))}`
          : ""}
        <span> · {data.days} hari kalender</span>
      </p>
      <div className="growth-visitor-chart__totals">
        <span>
          <strong>{integer.format(data.newVisitors)}</strong> baru tercatat
        </span>
        <span>
          <strong>{integer.format(data.returningVisitors)}</strong> kembali
        </span>
      </div>
      {hasVisitors ? (
        <>
          <div className="growth-visitor-chart__legend" aria-label="Keterangan garis grafik">
            <span>
              <i className="growth-visitor-chart__key growth-visitor-chart__key--new" aria-hidden="true" />
              Baru tercatat
            </span>
            <span>
              <i className="growth-visitor-chart__key growth-visitor-chart__key--returning" aria-hidden="true" />
              Kembali
            </span>
          </div>
          <div
            className="growth-visitor-chart__visual"
            role="img"
            aria-label={`Grafik ${data.days} hari: ${data.newVisitors} perangkat baru tercatat dan ${data.returningVisitors} perangkat kembali. Rincian angka per hari tersedia pada tabel di bawah.`}
          >
            <div className="growth-visitor-chart__scale" aria-hidden="true">
              <span>{integer.format(maximum)}</span>
              {maximum > 1 ? <span>{integer.format(Math.ceil(maximum / 2))}</span> : null}
              <span>0</span>
            </div>
            <div className="growth-visitor-chart__graph" aria-hidden="true">
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path d="M 0 880 H 1000" className="growth-visitor-chart__axis" />
                {series.map((item) => (
                  <path
                    key={item.key}
                    d={chartPath(
                      data.trend.map((day) => day[item.key]),
                      maximum,
                    )}
                    className={`growth-visitor-chart__line growth-visitor-chart__line--${item.className}`}
                  />
                ))}
              </svg>
              {series.map((item) => {
                const values = data.trend.map((day) => day[item.key]);
                const labels = labeledIndexes(values, data.days);
                return [...labels].map((index) => (
                  <span
                    key={`${item.key}-${index}`}
                    className={`growth-visitor-chart__point growth-visitor-chart__point--${item.className}${labels.has(index - 1) ? " is-staggered" : ""}`}
                    style={{
                      left: `${(index / Math.max(1, values.length - 1)) * 100}%`,
                      top: `${88 - (values[index] / maximum) * 70}%`,
                    }}
                  >
                    <b>{integer.format(values[index])}</b>
                    <i />
                  </span>
                ));
              })}
            </div>
          </div>
          <div className="growth-visitor-chart__dates" aria-label="Tanggal pada grafik">
            {dateTicks.map((index) => (
              <span
                key={data.trend[index].date}
                className={index === 0 ? "is-first" : index === data.trend.length - 1 ? "is-last" : undefined}
                style={{ left: `${(index / Math.max(1, data.trend.length - 1)) * 100}%` }}
              >
                {shortDate.format(dateAtJakartaMidnight(data.trend[index].date))}
              </span>
            ))}
          </div>
          <details className="growth-visitor-chart__details" key={data.days} open={data.days === 30}>
            <summary>{data.days === 30 ? "Angka harian lengkap" : "Lihat angka per hari"}</summary>
            <div className="growth-visitor-chart__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Baru tercatat</th>
                    <th>Kembali</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{fullDate.format(dateAtJakartaMidnight(day.date))}</th>
                      <td>{integer.format(day.newVisitors)}</td>
                      <td>{integer.format(day.returningVisitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="growth-visitor-chart__empty">Belum ada pengunjung yang tercatat dalam {data.days} hari ini.</p>
      )}
    </div>
  );
}
