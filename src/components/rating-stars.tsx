import { Star } from "lucide-react";

export function RatingStars({ value, onChange, size = 20, readOnly = false }: { value: number; onChange?: (v: number) => void; size?: number; readOnly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly || !onChange}
          onClick={() => onChange?.(n)}
          className={`transition-colors ${readOnly || !onChange ? "cursor-default" : "hover:scale-110"}`}
        >
          <Star
            size={size}
            className={n <= value ? "fill-racing-yellow text-racing-yellow" : "text-border"}
          />
        </button>
      ))}
    </div>
  );
}
