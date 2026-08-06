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
      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-100"
    >
      {label}
    </button>
  );
}
