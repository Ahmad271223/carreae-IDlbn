import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-brand text-white hover:opacity-90",
    secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-100",
    danger: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  }[variant];
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
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
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">
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
    <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-xs font-medium text-verified">
      ✓ {label}
    </span>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-red-700">{children}</p>;
}
