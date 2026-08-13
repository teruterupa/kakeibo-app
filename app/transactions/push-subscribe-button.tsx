"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type SubscribeStatus =
  | "checking"
  | "unsupported"
  | "subscribed"
  | "unsubscribed"
  | "subscribing"
  | "error";

export function PushSubscribeButton() {
  const [status, setStatus] = useState<SubscribeStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStatus(existing ? "subscribed" : "unsubscribed");
    }

    checkSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setStatus("subscribing");

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEYが設定されていません。");
      setStatus("error");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("unsubscribed");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const response = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error("購読情報の保存に失敗しました。");
      }

      setStatus("subscribed");
    } catch (subscribeError) {
      console.error("通知の購読に失敗しました:", subscribeError);
      setStatus("error");
    }
  }

  if (status === "unsupported" || status === "checking") {
    return null;
  }

  if (status === "subscribed") {
    return <p className="text-sm text-gray-500">通知は有効です</p>;
  }

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={status === "subscribing"}
      className="rounded bg-gray-200 px-3 py-1 text-sm text-black disabled:opacity-50"
    >
      {status === "subscribing"
        ? "設定中..."
        : status === "error"
          ? "通知の設定に失敗しました。もう一度タップ"
          : "通知を有効にする"}
    </button>
  );
}
