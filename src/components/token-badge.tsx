import { Link } from "@tanstack/react-router";
import { Coins } from "lucide-react";

export function TokenBadge({ balance }: { balance: number }) {
  return (
    <Link
      to="/dashboard/tokens"
      className="flex items-center gap-1.5 border border-racing-yellow/40 bg-racing-yellow/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-racing-yellow transition-colors hover:bg-racing-yellow/20"
    >
      <Coins className="size-3.5" />
      {balance}
    </Link>
  );
}
