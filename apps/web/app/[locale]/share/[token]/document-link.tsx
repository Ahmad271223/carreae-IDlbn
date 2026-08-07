"use client";
import { API_BASE } from "../../../../lib/api";

export function DocumentLink({
  token,
  documentId,
  label,
}: {
  token: string;
  documentId: string;
  label: string;
}) {
  async function open() {
    const response = await fetch(
      `${API_BASE}/api/v1/share/${token}/documents/${documentId}`,
    );
    if (!response.ok) return;
    const { url } = (await response.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  }
  return (
    <button
      onClick={open}
      className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:border-brand-tint/50 hover:bg-brand-soft"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
