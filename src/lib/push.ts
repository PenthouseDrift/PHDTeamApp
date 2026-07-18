import webPush from "web-push";

webPush.setVapidDetails(
  `mailto:${process.env.ADMIN_EMAILS ? JSON.parse(process.env.ADMIN_EMAILS)[0] : "admin@penthousedrift.com"}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (error) {
    console.error("Push notification failed:", error);
    return false;
  }
}

export async function sendToAllAdmins(
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  const { redis } = await import("./redis");

  // Get all admin push subscriptions
  const subKeys = await redis.smembers("push:admin:subscriptions");
  if (!subKeys || subKeys.length === 0) return 0;

  let sent = 0;
  for (const subKey of subKeys) {
    const subData = await redis.get(`push:subscription:${subKey}`);
    if (subData) {
      const subscription: PushSubscriptionData =
        typeof subData === "string" ? JSON.parse(subData) : subData as unknown as PushSubscriptionData;
      const success = await sendPushNotification(subscription, payload);
      if (success) sent++;
    }
  }

  return sent;
}
