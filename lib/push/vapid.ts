import webpush from "web-push";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

export function getWebPush(): typeof webpush {
  webpush.setVapidDetails(
    getEnv("VAPID_SUBJECT"),
    getEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    getEnv("VAPID_PRIVATE_KEY")
  );
  return webpush;
}
