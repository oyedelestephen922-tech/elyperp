export function usSessionStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const weekday = !["Sat", "Sun"].includes(wd);
  const open = weekday && minutes >= 570 && minutes < 960;
  const pre = weekday && minutes >= 240 && minutes < 570;
  const post = weekday && minutes >= 960 && minutes < 1200;
  return {
    open,
    label: open ? "US market open" : pre ? "US pre-market" : post ? "US after-hours" : "US market closed",
  };
}
