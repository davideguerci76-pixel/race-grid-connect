import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function useSort<T>(rows: T[], initialKey?: string, initialDir: SortDir = "asc") {
  const [key, setKey] = useState<string | undefined>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  function toggle(nextKey: string) {
    if (key === nextKey) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setKey(nextKey);
      setDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!key) return rows;
    const getter = (r: any) => {
      const parts = key.split(".");
      let v: any = r;
      for (const p of parts) v = v?.[p];
      if (Array.isArray(v)) return v.join(", ").toLowerCase();
      if (v == null) return "";
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      return String(v).toLowerCase();
    };
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, key, dir]);

  function indicator(k: string) {
    if (key !== k) return "";
    return dir === "asc" ? " ▲" : " ▼";
  }

  return { sorted, toggle, indicator, sortKey: key, sortDir: dir };
}
