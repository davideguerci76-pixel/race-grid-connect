import { Star } from "lucide-react";

/**
 * Custom SVG icons for double-blind ratings.
 * - Wrench = freelancer rating (given by team)
 * - Headset = team rating (given by freelancer)
 * Both support decimal rendering via clip-path.
 */

type Variant = "wrench" | "headset";

const ICONS: Record<Variant, { path: string; label: string }> = {
  wrench: {
    label: "Freelancer rating",
    path:
      "M22.7 4.3a1 1 0 0 0-1.6-.3l-3.3 3.3-2.4-2.4 3.3-3.3a1 1 0 0 0-.3-1.6c-2.9-1.2-6.4-.5-8.7 1.8a7 7 0 0 0-1.7 7.2l-6.6 6.6a3 3 0 1 0 4.2 4.2l6.6-6.6a7 7 0 0 0 7.2-1.7c2.3-2.3 3-5.8 1.3-7.2z",
  },
  headset: {
    label: "Team rating",
    path:
      "M12 2a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z",
  },
};

function Glyph({ variant, filled, size = 18 }: { variant: Variant; filled: boolean; size?: number }) {
  const { path, label } = ICONS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={label}
      className={filled ? "text-racing-yellow" : "text-border"}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

export function RatingIcons({
  value,
  count,
  variant = "wrench",
  size = 18,
  showNumber = true,
}: {
  value: number | null | undefined;
  count?: number | null;
  variant?: Variant;
  size?: number;
  showNumber?: boolean;
}) {
  const v = Math.max(0, Math.min(5, Number(value ?? 0)));
  return (
    <span className="inline-flex items-center gap-1 align-middle" title={`${v.toFixed(1)} / 5${count ? ` (${count})` : ""}`}>
      <span className="relative inline-flex items-center">
        <span className="inline-flex gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Glyph key={i} variant={variant} filled={false} size={size} />
          ))}
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${(v / 5) * 100}%` }}
          aria-hidden
        >
          <span className="inline-flex gap-0.5" style={{ width: `${size * 5 + 4 * 2}px` }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Glyph key={i} variant={variant} filled size={size} />
            ))}
          </span>
        </span>
      </span>
      {showNumber && (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {v.toFixed(1)}
          {typeof count === "number" && count >= 0 ? ` (${count})` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * Interactive picker: renders 5 clickable glyphs (integer selection),
 * used inside the rating submission form.
 */
export function RatingPicker({
  value,
  onChange,
  variant = "wrench",
  size = 24,
}: {
  value: number;
  onChange: (n: number) => void;
  variant?: Variant;
  size?: number;
}) {
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110"
          aria-label={`${n} / 5`}
        >
          <Glyph variant={variant} filled={n <= value} size={size} />
        </button>
      ))}
    </div>
  );
}

// Fallback re-export so existing imports don't break; consumers can migrate progressively.
export { Star as GenericStar };
