// Desktop notifications. Permission is only ever requested from a click.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

/**
 * Show a notification at most once per `key` per browser session, so a
 * re-render or a second open tab doesn't repeat it.
 */
export function notifyOnce(key: string, title: string, body: string): void {
  if (!notificationsEnabled()) return;
  try {
    const seen = `notified:${key}`;
    if (sessionStorage.getItem(seen)) return;
    sessionStorage.setItem(seen, "1");
  } catch {
    // Storage blocked: notify anyway; a rare repeat beats a missed FORCE_FLAT.
  }
  new Notification(title, { body, tag: key });
}
