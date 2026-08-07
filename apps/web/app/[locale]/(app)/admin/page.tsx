"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card, VerifiedBadge } from "../../../../components/ui";

const FILTERS = ["", "PENDING", "VERIFIED", "REJECTED", "SUSPENDED"] as const;

interface Organization {
  id: string;
  name: string;
  type: string;
  countryCode: string;
  verificationStatus: string;
  website: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const { t } = useT();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [denied, setDenied] = useState(false);
  const [audit, setAudit] = useState<boolean | null>(null);
  const [auditChecked, setAuditChecked] = useState(false);

  const reload = useCallback(() => {
    api<Organization[]>(`/admin/organizations${filter ? `?status=${filter}` : ""}`)
      .then((rows) => {
        setOrgs(rows);
        setDenied(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setDenied(true);
      });
  }, [filter]);
  useEffect(reload, [reload]);

  async function decide(id: string, decision: "verify" | "reject" | "suspend") {
    await api(`/admin/organizations/${id}/${decision}`, { method: "POST" }).catch(
      () => undefined,
    );
    reload();
  }

  async function checkAudit() {
    setAuditChecked(true);
    const result = await api<{ valid: boolean }>("/admin/audit/verify").catch(
      () => ({ valid: false }),
    );
    setAudit(result.valid);
  }

  if (denied) {
    return (
      <Card>
        <p className="text-sm text-gray-500">{t("admin.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-brand">{t("admin.title")}</h1>

      <Card title={t("admin.auditTitle")}>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={checkAudit}>
            {t("admin.auditCheck")}
          </Button>
          {auditChecked && audit !== null && (
            <span className={`text-sm ${audit ? "text-verified" : "text-red-700"}`}>
              {audit ? t("admin.auditValid") : t("admin.auditInvalid")}
            </span>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || "all"}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-3.5 py-2 text-sm transition-colors ${
              filter === f
                ? "bg-brand font-semibold text-white shadow-sm"
                : "bg-white text-muted ring-1 ring-inset ring-line hover:bg-brand-soft hover:text-brand"
            }`}
          >
            {f ? statusLabel(t, f) : t("admin.filter.all")}
          </button>
        ))}
      </div>

      {orgs.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        </Card>
      ) : (
        orgs.map((org) => (
          <Card key={org.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-sm text-gray-600">
                  {t(`org.type.${org.type}`)} · {org.countryCode}
                  {org.website && (
                    <>
                      {" · "}
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand underline"
                      >
                        {org.website}
                      </a>
                    </>
                  )}
                </p>
              </div>
              {org.verificationStatus === "VERIFIED" ? (
                <VerifiedBadge label={t("org.verified")} />
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {statusLabel(t, org.verificationStatus)}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {org.verificationStatus !== "VERIFIED" && (
                <Button onClick={() => decide(org.id, "verify")}>
                  {t("admin.verify")}
                </Button>
              )}
              {org.verificationStatus !== "REJECTED" && (
                <Button variant="danger" onClick={() => decide(org.id, "reject")}>
                  {t("admin.reject")}
                </Button>
              )}
              {org.verificationStatus !== "SUSPENDED" && (
                <Button variant="secondary" onClick={() => decide(org.id, "suspend")}>
                  {t("admin.suspend")}
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </>
  );
}

function statusLabel(t: (key: string) => string, status: string) {
  return status === "VERIFIED" ? t("org.verified") : t(`org.status.${status}`);
}
