import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidPushKey(value: unknown, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    BASE64URL_PATTERN.test(value)
  );
}

function isValidSubscriptionPayload(
  value: unknown
): value is SubscriptionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== "string" || v.endpoint === "") {
    return false;
  }
  if (typeof v.keys !== "object" || v.keys === null) {
    return false;
  }
  const keys = v.keys as Record<string, unknown>;
  return (
    isValidPushKey(keys.p256dh, 100) && isValidPushKey(keys.auth, 50)
  );
}

// 既知のWebプッシュサービスのホスト名のみ許可する（SSRF対策）。
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome / Edge / Android
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari / iOS（このアプリの主要な利用環境）
]);

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" && ALLOWED_PUSH_ENDPOINT_HOSTS.has(url.hostname)
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (!isValidSubscriptionPayload(body)) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (!isAllowedPushEndpoint(body.endpoint)) {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("通知の購読情報の保存に失敗しました:", error);
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
