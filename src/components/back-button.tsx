import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function BackButton({ label = "Back", className = "" }: { label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
        else router.navigate({ to: "/" });
      }}
      className={`inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-racing-red hover:text-foreground ${className}`}
    >
      <ArrowLeft className="size-4" />
      {label}
    </button>
  );
}
