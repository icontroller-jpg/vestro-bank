import React, { useEffect, useRef } from "react";

// Stable ids for label/input pairing (no dependency on React 18's useId).
let _uid = 0;
function useUid() {
  const r = useRef(null);
  if (r.current === null) r.current = `f${++_uid}`;
  return r.current;
}

const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------- Layout ---------- */

export function Page({ title, subtitle, actions, children, className }) {
  return (
    <section className={cx("page", className)}>
      {(title || actions) && (
        <div className="page-head">
          <div>
            {title && <h1>{title}</h1>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ title, actions, children, className, ...rest }) {
  return (
    <div className={cx("card", className)} {...rest}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Empty({ title, text, children }) {
  return (
    <div className="empty">
      {title && <b>{title}</b>}
      {(text || children) && <div className="muted">{text || children}</div>}
    </div>
  );
}

export function Notice({ kind = "info", title, children }) {
  return (
    <div className={cx("notice", kind)} role={kind === "bad" || kind === "err" ? "alert" : "status"}>
      <div>
        {title && <b>{title}</b>}
        <div className="notice-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Status / data display ---------- */

export function Pill({ kind, tone, children, className }) {
  return <span className={cx("pill", kind || tone, className)}>{children}</span>;
}

const STATUS_TONE = {
  ACTIVE: "ok", OPEN: "ok", COMPLETED: "ok", SUCCESS: "ok", APPROVED: "ok", PAID: "ok", VERIFIED: "ok", LIVE: "ok",
  PENDING: "warn", HELD: "warn", PROCESSING: "warn", DORMANT: "warn", MATURING: "warn", UNDER_REVIEW: "warn", IN_REVIEW: "warn",
  FAILED: "bad", BLOCKED: "bad", FROZEN: "bad", REJECTED: "bad", CLOSED: "bad", LOCKED: "bad", EXPIRED: "bad", CANCELLED: "bad", SUSPENDED: "bad",
};

export function StatusPill({ status, children }) {
  const key = String(status ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const label = children ?? String(status ?? "").replace(/_/g, " ").toLowerCase();
  return <span className={cx("pill", STATUS_TONE[key])}>{label}</span>;
}

// Accepts either label/value, k/v, or children as the value.
export function KV({ label, k, value, v, children }) {
  return (
    <div className="kv">
      <span className="muted">{label ?? k}</span>
      <b>{value ?? v ?? children}</b>
    </div>
  );
}

export function Stat({ label, value, sub, hint, children }) {
  return (
    <div className="stat">
      <small className="muted">{label}</small>
      <b>{value ?? children}</b>
      {(sub || hint) && <small className="muted">{sub || hint}</small>}
    </div>
  );
}

export function Bar({ value = 0, max = 100, pct, tone, label }) {
  const raw = pct ?? (max ? (100 * value) / max : 0);
  const p = Math.max(0, Math.min(100, raw));
  return (
    <div className={cx("bar", tone)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${p}%` }} />
    </div>
  );
}

/* ---------- Inputs ---------- */

// Wrapper when given children; renders a native <input> when not.
// Native usage passes the change event straight through: onChange={(e) => ...e.target.value}
export function Field({ label, hint, error, children, id, className, ...rest }) {
  const auto = useUid();
  const fid = id || auto;
  return (
    <div className={cx("field", error && "has-err", className)}>
      {label && <label htmlFor={fid}>{label}</label>}
      {children ?? <input id={fid} aria-invalid={!!error} {...rest} />}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

// Rupee input. onChange receives the cleaned STRING value (digits and one decimal point), not an event.
export function AmountField({ label, value, onChange, hint, error, id, className, ...rest }) {
  const auto = useUid();
  const fid = id || auto;
  const clean = (s) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./, "$1");
  return (
    <div className={cx("field", "amount", error && "has-err", className)}>
      {label && <label htmlFor={fid}>{label}</label>}
      <div className="amount-wrap">
        <span className="amount-prefix" aria-hidden="true">₹</span>
        <input id={fid} inputMode="decimal" autoComplete="off" placeholder="0" aria-invalid={!!error}
          value={value ?? ""} onChange={(e) => onChange?.(clean(e.target.value))} {...rest} />
      </div>
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

// options: ["A", "B"] or [{ value, label }]. Passes the native change event through, like <select>.
export function Select({ label, value, onChange, options, children, hint, error, id, className, ...rest }) {
  const auto = useUid();
  const fid = id || auto;
  return (
    <div className={cx("field", error && "has-err", className)}>
      {label && <label htmlFor={fid}>{label}</label>}
      <select id={fid} value={value} onChange={onChange} aria-invalid={!!error} {...rest}>
        {options
          ? options.map((o) => {
              const ov = typeof o === "object" ? o.value : o;
              const ol = typeof o === "object" ? o.label ?? o.value : o;
              return <option key={ov} value={ov}>{ol}</option>;
            })
          : children}
      </select>
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

// onChange receives the selected VALUE, not an event.
export function Segmented({ options = [], value, onChange, label, className }) {
  return (
    <div className={cx("seg", className)} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const ov = typeof o === "object" ? o.value : o;
        const ol = typeof o === "object" ? o.label ?? o.value : o;
        const on = ov === value;
        return (
          <button key={ov} type="button" role="radio" aria-checked={on} className={cx("seg-btn", on && "on")} onClick={() => onChange?.(ov)}>
            {ol}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className={`switch ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
    />
  );
}

/* ---------- Modal ---------- */

export function Modal({ title, onClose, locked, footer, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;

  // Mount-only: OtpModal re-renders every 500ms, so this must not re-run
  // or it would steal focus from the OTP input.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !lockedRef.current) closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose?.();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn sm ghost" onClick={onClose} disabled={locked} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

// download("statement.csv", csvText, "text/csv")
export function download(filename, content, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}