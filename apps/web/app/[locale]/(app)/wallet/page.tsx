"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, ErrorText } from "../../../../components/ui";

interface Doc {
  id: string;
  fileName: string;
  category: string;
  scanStatus: string;
  createdAt: string;
}

const CATEGORIES = ["CERTIFICATE", "TRANSCRIPT", "REFERENCE", "PHOTO", "OTHER"];

export default function WalletPage() {
  const { t } = useT();
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [category, setCategory] = useState("CERTIFICATE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<Doc[]>("/documents").then(setDocuments).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const intent = await api<{ documentId: string; uploadUrl: string }>(
        "/documents/upload-intent",
        { method: "POST", body: { fileName: file.name, category } },
      );
      const put = await fetch(intent.uploadUrl, { method: "PUT", body: file });
      if (!put.ok) throw new Error("upload failed");
      await api(`/documents/${intent.documentId}/complete`, { method: "POST" });
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function download(id: string) {
    const { url } = await api<{ url: string }>(`/documents/${id}/download`);
    window.open(url, "_blank", "noopener");
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("wallet.title")}</h1>
      <Card title={t("wallet.upload")}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">
              {t("wallet.category")}
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
            className="text-sm"
          />
        </div>
        <ErrorText>{error}</ErrorText>
      </Card>
      <Card title={t("wallet.title")}>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm transition-colors hover:border-brand-tint/40"
              >
                <span>
                  {doc.fileName}
                  <span className="ms-2 text-xs text-gray-400">{doc.category}</span>
                  {doc.scanStatus === "PENDING" && (
                    <span className="ms-2 text-xs text-gray-500">
                      {t("wallet.scanPending")}
                    </span>
                  )}
                  {doc.scanStatus === "INFECTED" && (
                    <span className="ms-2 text-xs text-red-600">
                      {t("wallet.infected")}
                    </span>
                  )}
                </span>
                {doc.scanStatus === "CLEAN" && (
                  <Button variant="secondary" onClick={() => download(doc.id)}>
                    {t("wallet.download")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
