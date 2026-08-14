import type { SupabaseClient } from "@supabase/supabase-js";
import { getWebPush } from "./vapid";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

export async function sendPushNotificationToAllSubscriptions(
  supabase: SupabaseClient,
  payload: PushPayload
): Promise<void> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("通知の宛先取得に失敗しました:", error);
    return;
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return;
  }

  let webpush: ReturnType<typeof getWebPush>;
  try {
    webpush = getWebPush();
  } catch (initError) {
    console.error("VAPID設定の初期化に失敗しました:", initError);
    return;
  }

  const serializedPayload = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          serializedPayload,
          { timeout: 5000 }
        );
      } catch (sendError) {
        const statusCode = getStatusCode(sendError);
        if (statusCode === 404 || statusCode === 410) {
          try {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id);
          } catch (deleteError) {
            console.error("無効な購読情報の削除に失敗しました:", deleteError);
          }
        } else {
          console.error("プッシュ通知の送信に失敗しました:", sendError);
        }
      }
    })
  );
}
