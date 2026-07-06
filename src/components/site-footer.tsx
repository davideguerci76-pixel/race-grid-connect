export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-carbon">
      <div className="container-page grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-xl font-black italic tracking-tighter">
            <span className="inline-block h-6 w-6 skew-x-[-15deg] bg-racing-red" />
            PADDOCK<span className="text-racing-red">PRO</span>
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Il network professionale che connette freelance del motorsport e scuderie di tutto il mondo.
            Dal karting alla Formula 1.
          </p>
        </div>
        <div>
          <div className="label-mono mb-3">Network</div>
          <ul className="space-y-2 text-sm">
            <li>Bacheca Lavori</li>
            <li>Freelance</li>
            <li>Scuderie</li>
          </ul>
        </div>
        <div>
          <div className="label-mono mb-3">Legale</div>
          <ul className="space-y-2 text-sm">
            <li>Privacy</li>
            <li>Termini</li>
            <li>Cookie</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex items-center justify-between py-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2026 PaddockPro Italia</span>
          <span>Codice Paddock 44.029 / Z-1</span>
        </div>
      </div>
    </footer>
  );
}
