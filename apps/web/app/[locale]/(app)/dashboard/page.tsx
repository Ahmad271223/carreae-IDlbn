"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Card } from "../../../../components/ui";

interface Completion {
  score: number;
  sections: Record<string, boolean>;
}
interface Notification {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
}

export default function DashboardPage() {
  const { locale, t } = useT();
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    api<Completion>("/profile/completion").then(setCompletion).catch(() => undefined);
    api<Notification[]>("/notifications").then(setNotifications).catch(() => undefined);
  }, []);

  return (
    <>
      <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      <Card title={t("dashboard.completion")}>
        {completion ? (
          <div>
            <div className="mb-2 h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-verified transition-all"
                style={{ inlineSize: `${completion.score}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">{completion.score} / 100</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        )}
      </Card>
      <Card
        title={t("dashboard.notifications")}
        actions={
          <Link
            href={`/${locale}/notifications`}
            className="text-xs text-brand hover:underline"
          >
            {t("dashboard.viewAll")}
          </Link>
        }
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {notifications.slice(0, 10).map((n) => (
              <li key={n.id} className={n.readAt ? "text-gray-400" : ""}>
                {n.type} · {new Date(n.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
