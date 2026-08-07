import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "btn-primary",
    secondary:
      "bg-white text-brand border border-line hover:border-brand-tint/50 hover:bg-brand-soft transition-colors",
    danger:
      "bg-white text-red-700 border border-red-200 hover:bg-red-50 transition-colors",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm transition-all placeholder:text-muted/70 focus:border-brand-tint focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-tint)_14%,transparent)] focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-semibold text-ink/80">{label}</span>
      {children}
    </label>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="surface-card rounded-2xl p-6">
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** §5: only VERIFIED gets the positive accent — nothing else gets a marker. */
export function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-verified/10 px-2.5 py-1 text-xs font-semibold text-verified ring-1 ring-inset ring-verified/20">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-700">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v6m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {children}
    </p>
  );
}
