"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useT } from "../../../../lib/i18n-client";
import { Button, Card } from "../../../../components/ui";

interface Notification {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
}

export default function NotificationsPage() {
  const { t } = useT();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<Notification[]>("/notifications").then(setNotifications).catch(() => undefined);
  }, []);
  useEffect(reload, [reload]);

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
    reload();
  }

  async function markAllRead() {
    setBusy(true);
    const unread = notifications.filter((n) => !n.readAt);
    await Promise.all(
      unread.map((n) =>
        api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined),
      ),
    );
    setBusy(false);
    reload();
  }

  /** Known types get copy; anything new degrades to a readable form of the key. */
  function label(type: string) {
    const key = `notifications.type.${type}`;
    const translated = t(key);
    return translated === key ? type.replace(/[._]/g, " ") : translated;
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
      <Card
        actions={
          unreadCount > 0 ? (
            <Button variant="secondary" disabled={busy} onClick={markAllRead}>
              {t("notifications.markAllRead")}
            </Button>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500">{t("common.none")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2 text-sm">
                  {!n.readAt && (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-brand"
                      aria-hidden
                    />
                  )}
                  <span className={n.readAt ? "text-gray-400" : "font-medium"}>
                    {label(n.type)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </span>
                {!n.readAt && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="text-xs text-gray-400 hover:text-brand"
                  >
                    {t("notifications.markRead")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
