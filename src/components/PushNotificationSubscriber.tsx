"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function PushNotificationSubscriber() {
  const { data: session } = useSession();
  const [subscribed, setSubscribed] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!session?.user || !supported) return;

    async function subscribe() {
      try {
        // Register push service worker
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Check if already subscribed
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setSubscribed(true);
          // Re-send to server in case it was lost
          await sendSubscriptionToServer(existing);
          return;
        }

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Subscribe
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        });

        await sendSubscriptionToServer(subscription);
        setSubscribed(true);
      } catch (error) {
        console.error("Push subscription failed:", error);
      }
    }

    subscribe();
  }, [session, supported]);

  if (!supported || subscribed) return null;

  return null; // Silent subscriber — no UI needed
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  const json = subscription.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
      },
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
