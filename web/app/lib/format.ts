// Display helpers. Safe on the client; no I/O.

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2028-03-14" → "14 Mar 2028". Anything else is returned as given. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "2028-07" → "Jul 2028". */
export function fmtMonth(ym: string | null | undefined): string {
  if (!ym) return "—";
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return `${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d} d ago`;
  return fmtDate(iso.slice(0, 10));
}

/** Waiting time for the queue: compact, monotonic. */
export function waiting(iso: string, now = Date.now()): { text: string; tone: "none" | "warn" | "err" } {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const h = ms / 3_600_000;
  const text = h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} min` : h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
  return { text, tone: h >= 24 ? "err" : h >= 4 ? "warn" : "none" };
}

/** "0413" → "#0413"; anything non-numeric is shown as typed. */
export function caseLabel(id: string): string {
  return /^\d+$/.test(id) ? `#${id}` : id;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
