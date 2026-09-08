import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Shared contextual-help primitive.
 *
 * Desktop: opens on hover (fine pointer only) and on keyboard focus/Enter.
 * Touch: the help trigger is a separate control — tapping it opens the help.
 * The adjacent action button is never intercepted, so actions stay single-tap.
 * Escape and outside tap close; focus returns to the trigger (Radix Popover).
 */
export function HelpHint({
  titleKey,
  bodyKey,
  values,
  className,
  size = 14,
}: {
  /** i18n key for the short help title, e.g. "help.team.publish_now.title" */
  titleKey?: string;
  /** i18n key for the help body */
  bodyKey: string;
  values?: Record<string, unknown>;
  className?: string;
  size?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const finePointer = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    finePointer.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const hoverOpen = () => {
    if (!finePointer.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    if (!finePointer.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const label = t("help.trigger_label", { defaultValue: "More information" }) as string;
  const title = titleKey ? (t(titleKey) as string) : null;
  const body = String(t(bodyKey, values as never));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
          onFocus={hoverOpen}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-racing-yellow ${className ?? ""}`}
        >
          <HelpCircle style={{ width: size, height: size }} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        role="note"
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
        onClick={(e) => e.stopPropagation()}
        className="z-50 w-72 max-w-[calc(100vw-2rem)] border-border bg-card p-3 text-left"
      >
        {title && (
          <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">{title}</div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </PopoverContent>
    </Popover>
  );
}
