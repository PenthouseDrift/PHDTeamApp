"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type SubscriptionState = "checking" | "prompt" | "subscribing" | "subscribed" | "hidden" | "error";

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PushNotificationSubscriber() {
  const { data: session } = useSession();
  const [state, setState] = useState<SubscriptionState>("checking");

  useEffect(() => {
    if (!session?.user) return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return;

    let cancelled = false;

    async function inspectSubscription() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          // iOS can retain a subscription created with a stale VAPID key. If the
          // key no longer matches, iOS refuses to deliver pushes, so drop the old
          // one and fall through to create a fresh subscription.
          if (subscriptionMatchesVapidKey(existing)) {
            await sendSubscriptionToServer(existing);
            if (!cancelled) setState("subscribed");
            return;
          }
          await existing.unsubscribe();
        }

        if (Notification.permission === "granted") {
          await createSubscription(registration);
          if (!cancelled) setState("subscribed");
        } else if (Notification.permission === "default" && isStandaloneMode()) {
          if (!cancelled) setState("prompt");
        } else if (!cancelled) {
          setState("hidden");
        }
      } catch (error) {
        console.error("Push subscription check failed:", error);
        if (!cancelled) setState("error");
      }
    }

    void inspectSubscription();
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  async function enableNotifications() {
    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("hidden");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      await createSubscription(registration);
      setState("subscribed");
    } catch (error) {
      console.error("Push subscription failed:", error);
      setState("error");
    }
  }

  if (state !== "prompt" && state !== "subscribing" && state !== "error") return null;

  return (
    <aside className="pwa-notification-prompt fixed left-4 right-4 z-[60] mx-auto max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900" aria-live="polite">
      <button onClick={() => setState("hidden")} className="absolute right-3 top-3 p-1 text-zinc-400" aria-label="Dismiss notification prompt">×</button>
      <div className="pr-6">
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Enable track alerts?</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Receive event and track updates on this device. You can change this later in system settings.
        </p>
      </div>
      {state === "error" && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Notifications could not be enabled. Please try again.</p>}
      <button
        onClick={enableNotifications}
        disabled={state === "subscribing"}
        className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-60"
      >
        {state === "subscribing" ? "Enabling…" : "Enable notifications"}
      </button>
    </aside>
  );
}

async function createSubscription(registration: ServiceWorkerRegistration) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured");

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // iOS Safari rejects a detached ArrayBuffer here and throws InvalidStateError.
    // It requires a typed-array view (Uint8Array), so pass that directly.
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  await sendSubscriptionToServer(subscription);
}

// Compares the key an existing subscription was created with against the current
// VAPID public key. Returns true when they match (or when we cannot tell).
function subscriptionMatchesVapidKey(subscription: PushSubscription): boolean {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return true;
  const existingKey = subscription.options?.applicationServerKey;
  if (!existingKey) return true;
  const current = urlBase64ToUint8Array(vapidKey);
  const existing = new Uint8Array(existingKey);
  if (existing.length !== current.length) return false;
  for (let i = 0; i < existing.length; i += 1) {
    if (existing[i] !== current[i]) return false;
  }
  return true;
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
      },
    }),
  });
  if (!response.ok) throw new Error(`Push subscription sync failed: ${response.status}`);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Back the view with a concrete ArrayBuffer so it satisfies BufferSource
  // (pushManager.subscribe rejects SharedArrayBuffer-backed views on the types).
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let index = 0; index < rawData.length; index += 1) outputArray[index] = rawData.charCodeAt(index);
  return outputArray;
}