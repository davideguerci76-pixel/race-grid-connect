import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Card System V2 — shared anatomy.
 * Hierarchy: STATE → ACTION → ALERT → IDENTITY → FACTS → DETAILS → FOOTER.
 * Purely presentational: no data fetching, no business rules.
 */

export type CardTone = "neutral" | "full" | "partial" | "perfect" | "danger" | "locked" | "pool" | "confirmed";

const toneBorder: Record<CardTone, string> = {
  neutral: "border-border bg-card",
  full: "border-success/50 bg-card",
  partial: "border-racing-yellow/50 bg-card",
  perfect: "border-racing-yellow/70 bg-racing-yellow/5",
  danger: "border-racing-red/60 bg-card",
  locked: "border-dashed border-border bg-card/70",
  pool: "border-sky-400/50 bg-card",
  confirmed: "border-success/70 bg-card",
};

export function CardShell({
  tone = "neutral",
  className,
  children,
  id,
  highlighted = false,
}: {
  tone?: CardTone;
  className?: string;
  children: ReactNode;
  id?: string;
  highlighted?: boolean;
}) {
  return (
    <div className="@container">
      <article
        id={id}
        className={cn(
          "scroll-mt-24 overflow-hidden rounded-xl border text-foreground",
          toneBorder[tone],
          highlighted && "ring-2 ring-racing-yellow ring-offset-2 ring-offset-background",
          className,
        )}
      >
        {children}
      </article>
    </div>
  );
}

export type StateTone = "success" | "warn" | "danger" | "muted" | "info";

const dotTone: Record<StateTone, string> = {
  success: "border-success/60 bg-success/15 text-success",
  warn: "border-racing-yellow/60 bg-racing-yellow/15 text-racing-yellow",
  danger: "border-racing-red/60 bg-racing-red/15 text-racing-red",
  muted: "border-border bg-secondary text-muted-foreground",
  info: "border-sky-400/60 bg-sky-400/15 text-sky-300",
};
const textTone: Record<StateTone, string> = {
  success: "text-success",
  warn: "text-racing-yellow",
  danger: "text-racing-red",
  muted: "text-muted-foreground",
  info: "text-sky-300",
};

/** LEVEL 1 — STATE. What am I looking at, and what state is it in. */
export function CardHeader({
  icon,
  tone = "muted",
  title,
  subtitle,
  right,
  children,
}: {
  icon?: ReactNode;
  tone?: StateTone;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-b from-foreground/[0.04] to-transparent px-4 pt-4 pb-3 @lg:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", dotTone[tone])} aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className={cn("text-[15px] font-extrabold leading-tight", textTone[tone])}>{title}</div>
          {subtitle && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</div>}
          {children}
        </div>
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">{right}</div>}
    </header>
  );
}

/** LEVEL 2 — ACTIONS. Primary/secondary CTAs for the current state. */
export function ActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 px-4 pb-3 @lg:px-5", className)}>{children}</div>;
}

const btnBase = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const cardBtn = {
  primary: cn(btnBase, "bg-racing-red text-white hover:brightness-110"),
  secondary: cn(btnBase, "border border-border bg-foreground/5 text-foreground hover:border-racing-red"),
  danger: cn(btnBase, "border border-racing-red/60 text-racing-red hover:bg-racing-red/10"),
  warn: cn(btnBase, "bg-racing-yellow text-carbon hover:brightness-110"),
  ghost: cn(btnBase, "border border-border text-muted-foreground hover:bg-secondary"),
  pool: cn(btnBase, "border border-sky-400/60 text-sky-300 hover:bg-sky-400/10"),
  dark: cn(btnBase, "bg-foreground text-background hover:bg-racing-red hover:text-white"),
};

/** Non-interactive state chip rendered where a CTA would be. */
export function StatusChip({ tone = "muted", children, className }: { tone?: StateTone; children: ReactNode; className?: string }) {
  const map: Record<StateTone, string> = {
    success: "border-success/60 bg-success/10 text-success",
    warn: "border-racing-yellow/60 bg-racing-yellow/10 text-racing-yellow",
    danger: "border-racing-red/60 bg-racing-red/10 text-racing-red",
    muted: "border-border bg-secondary/60 text-muted-foreground",
    info: "border-sky-400/60 bg-sky-400/10 text-sky-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10.5px] font-bold uppercase tracking-widest", map[tone], className)}>
      {children}
    </span>
  );
}

/** LEVEL 3 — ALERT. Warnings, deadlines, things that need attention now. */
export function AlertStrip({
  tone = "warn",
  icon,
  title,
  children,
  right,
  actions,
}: {
  tone?: StateTone;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  right?: ReactNode;
  actions?: ReactNode;
}) {
  const map: Record<StateTone, string> = {
    success: "border-success/40 bg-success/5",
    warn: "border-racing-yellow/40 bg-racing-yellow/5",
    danger: "border-racing-red/50 bg-racing-red/5",
    muted: "border-border bg-secondary/40",
    info: "border-sky-400/40 bg-sky-400/5",
  };
  return (
    <div className={cn("mx-4 mb-3 rounded-lg border px-3 py-2.5 @lg:mx-5", map[tone])} role={tone === "danger" ? "alert" : undefined}>
      <div className="flex flex-wrap items-start gap-2.5">
        {icon && <span className={cn("mt-0.5 shrink-0", textTone[tone])}>{icon}</span>}
        <div className="min-w-0 flex-1">
          {title && <div className={cn("text-[13px] font-bold", textTone[tone])}>{title}</div>}
          {children && <div className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>}
        </div>
        {right && <div className={cn("shrink-0 text-[12px] font-semibold", textTone[tone])}>{right}</div>}
      </div>
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Body wrapper: identity, facts, details. */
export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-2.5 px-4 pb-4 @lg:px-5", className)}>{children}</div>;
}

/** LEVEL 4 — IDENTITY. Who is the subject (or why it is hidden). */
export function IdentityRow({
  avatar,
  avatarTone = "muted",
  name,
  meta,
  pills,
  hiddenNote,
}: {
  avatar: ReactNode;
  avatarTone?: StateTone;
  name: ReactNode;
  meta?: ReactNode;
  pills?: ReactNode;
  hiddenNote?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full border text-[13px] font-extrabold", dotTone[avatarTone])}>{avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-bold leading-tight">{name}</span>
            {pills}
          </div>
          {meta && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{meta}</div>}
        </div>
      </div>
      {hiddenNote && <div className="mt-2 border-t border-border pt-2 text-[12px] text-muted-foreground">{hiddenNote}</div>}
    </div>
  );
}

export function Pill({ tone = "muted", children, className }: { tone?: StateTone; children: ReactNode; className?: string }) {
  const map: Record<StateTone, string> = {
    success: "border-success/60 text-success",
    warn: "border-racing-yellow/60 text-racing-yellow",
    danger: "border-racing-red/60 text-racing-red",
    muted: "border-border text-muted-foreground",
    info: "border-sky-400/60 text-sky-300",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold", map[tone], className)}>{children}</span>;
}

/** LEVEL 5 — FACTS. Decision data in a scannable grid; each fact only renders when it has data. */
export function FactGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? "@md:grid-cols-2" : cols === 3 ? "@md:grid-cols-3" : "@md:grid-cols-4";
  return <div className={cn("grid grid-cols-2 gap-2", c)}>{children}</div>;
}

export function Fact({
  icon,
  label,
  value,
  sub,
  tone,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StateTone;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-2", className)}>
      {icon && <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">{icon}</span>}
      <div className="min-w-0">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <div className={cn("break-words text-[13px] font-bold leading-snug", tone && textTone[tone])}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/** LEVEL 6 — DETAILS. Titled section; render only when there is content. */
export function Section({ icon, title, children, tone, className }: { icon?: ReactNode; title: ReactNode; children: ReactNode; tone?: StateTone; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-secondary/40 px-3 py-2.5", className)}>
      <h4 className={cn("mb-2 flex items-center gap-2 text-[12.5px] font-bold", tone ? textTone[tone] : "text-foreground")}>
        {icon && <span className="text-muted-foreground [&>svg]:size-[15px]">{icon}</span>}
        {title}
      </h4>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

export function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "hard" | "soft" | "ok"; className?: string }) {
  const map = {
    muted: "border-border bg-foreground/5 text-foreground",
    hard: "border-racing-red/60 bg-racing-red/10 font-semibold text-racing-red",
    soft: "border-racing-yellow/60 bg-racing-yellow/10 text-racing-yellow",
    ok: "border-success/50 bg-success/10 text-success",
  } as const;
  return <span className={cn("rounded-md border px-2 py-0.5 text-[11.5px] leading-snug", map[tone], className)}>{children}</span>;
}

export function KeyValue({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
}

/** Progressive disclosure for secondary detail. Primary decision data must stay outside. */
export function DetailsToggle({
  children,
  defaultOpen = false,
  summary,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-racing-red hover:text-foreground"
      >
        {open ? t("mcard.hide_details") : t("mcard.view_details")}
        {!open && summary && <span className="normal-case tracking-normal text-muted-foreground/80">· {summary}</span>}
        {open ? <ChevronUp className="size-3.5 text-racing-red" /> : <ChevronDown className="size-3.5 text-racing-red" />}
      </button>
      {open && <div className="mt-2.5 grid gap-2.5">{children}</div>}
    </div>
  );
}

/** LEVEL 7 — FOOTER. Secondary tools (calendar, contacts export) and metadata. */
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 border-t border-border bg-foreground/[0.02] px-4 py-2.5 @lg:px-5", className)}>{children}</div>;
}

export function MetaLine({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-3 font-mono text-[10.5px] text-muted-foreground/80 @lg:px-5">{children}</div>;
}
