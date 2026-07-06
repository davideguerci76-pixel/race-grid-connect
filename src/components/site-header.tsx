import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-xl font-black italic tracking-tighter">
          <span className="inline-block h-6 w-6 skew-x-[-15deg] bg-racing-red" />
          PADDOCK<span className="text-racing-red">PRO</span>
        </Link>
        <div className="hidden gap-6 text-xs font-bold uppercase tracking-widest text-muted-foreground md:flex">
          <Link to="/bacheca" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
            Bacheca Lavori
          </Link>
          <Link to="/freelance" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
            Freelance
          </Link>
          <Link to="/scuderie" className="transition-colors hover:text-racing-red" activeProps={{ className: "text-foreground" }}>
            Scuderie
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/registrati"
            className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
          >
            Accedi
          </Link>
          <Link
            to="/registrati"
            className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110"
          >
            Join the Grid
          </Link>
        </div>
      </div>
    </nav>
  );
}
