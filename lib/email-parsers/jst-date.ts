export function toJstDateString(date: Date): string {
  const jstMillis = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMillis);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
