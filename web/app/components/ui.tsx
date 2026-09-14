"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "./icons";

// ---------------------------------------------------------------- stepper

const STEPS = ["Upload", "Classify", "Review", "Validate"] as const;

export function ProgressStepper({ current, caseId }: { current: 1 | 2 | 3 | 4; caseId: string | null }) {
  const hrefs = caseId
    ? ["/cases/new", `/cases/${encodeURIComponent(caseId)}/classify`, `/cases/${encodeURIComponent(caseId)}/review`, `/cases/${encodeURIComponent(caseId)}`]
    : [null, null, null, null];
  return (
    <nav className="stepper" aria-label="Case steps">
      {STEPS.map((name, i) => {
        const n = i + 1;
        const cls = n < current ? "step done" : n === current ? "step current" : "step";
        const inner = (
          <>
            <span className="n">{n < current ? <Icon name="check" size={11} /> : n}</span>
            {name}
          </>
        );
        const href = hrefs[i];
        return (
          <span key={name} className="row" style={{ gap: 8 }}>
            {i > 0 && <span className="step-sep" />}
            {href && n <= current ? (
              <Link href={href} className={cls} aria-current={n === current ? "step" : undefined}>
                {inner}
              </Link>
            ) : (
              <span className={cls} aria-current={n === current ? "step" : undefined}>
                {inner}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- empty state

export function EmptyState({ icon = "folder", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">
        <Icon name={icon} size={20} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
      {body && <div className="muted small" style={{ marginTop: 4 }}>{body}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- toast

type ToastTone = "ok" | "info" | "err";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const ToastContext = createContext<(tone: ToastTone, text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: ToastTone, text: string) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  const colour: Record<ToastTone, string> = { ok: "var(--success)", info: "var(--primary)", err: "var(--error)" };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span className="dot" style={{ background: colour[t.tone] }} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------- confirmation dialog

/**
 * The only modal in the product. Used for destructive actions and for
 * anything that leaves the building (a request to the student, re-reading
 * pages under a new type). Everything else is inline.
 */
export function ConfirmationDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onCancel} onCancel={onCancel}>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
      <div className="foot">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={`btn ${tone}`} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------- misc

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function errorOf(body: unknown, status: number, fallback = "Request failed"): string {
  return body !== null && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `${fallback} (${status})`;
}

export function useSet<T>(initial: readonly T[] = []) {
  const [set, setSet] = useState(() => new Set(initial));
  const api = useMemo(
    () => ({
      has: (x: T) => set.has(x),
      add: (x: T) => setSet((s) => new Set(s).add(x)),
      del: (x: T) =>
        setSet((s) => {
          const n = new Set(s);
          n.delete(x);
          return n;
        }),
    }),
    [set],
  );
  return api;
}
