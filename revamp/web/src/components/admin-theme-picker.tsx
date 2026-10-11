type Theme = "system" | "light" | "dark";

const themeMeta = {
  system: { label: "Ikuti tema sistem", shortLabel: "Sistem" },
  light: { label: "Gunakan tema terang", shortLabel: "Terang" },
  dark: { label: "Gunakan tema gelap", shortLabel: "Gelap" },
} as const;

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49M18.54 18.54l-1.49-1.49M6.95 6.95 5.46 5.46" />
      </svg>
    );
  }

  if (theme === "dark") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20.25 15.08A8.5 8.5 0 0 1 8.92 3.75a8.5 8.5 0 1 0 11.33 11.33Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3.75" y="4.5" width="16.5" height="11.75" rx="1.75" />
      <path d="M9 19.5h6M12 16.25v3.25" />
    </svg>
  );
}

export function AdminThemePicker({
  theme,
  onChange,
  name,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  name: string;
}) {
  return (
    <fieldset className="admin-theme-picker">
      <legend>Tampilan</legend>
      {(["system", "light", "dark"] as const).map((option) => (
        <label key={option} title={themeMeta[option].label}>
          <input
            aria-label={themeMeta[option].label}
            checked={theme === option}
            name={name}
            onChange={() => onChange(option)}
            type="radio"
            value={option}
          />
          <span aria-hidden="true">
            <ThemeIcon theme={option} />
          </span>
          <span className="admin-sr-only">{themeMeta[option].shortLabel}</span>
        </label>
      ))}
    </fieldset>
  );
}
