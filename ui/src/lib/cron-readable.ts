/**
 * Tiny best-effort cron → plain-English helper for the routine Triggers section.
 * Not a full cron parser: it covers the common shapes Paperclip schedule triggers
 * produce (every N minutes/hours, daily at HH:MM, weekday/weekend, day-of-week).
 * Falls back to the raw expression when it can't confidently describe it.
 */

import { t } from "@/i18n";

function dayNames(): string[] {
  return [
    t("ui3lib.cronReadable.days.sunday"),
    t("ui3lib.cronReadable.days.monday"),
    t("ui3lib.cronReadable.days.tuesday"),
    t("ui3lib.cronReadable.days.wednesday"),
    t("ui3lib.cronReadable.days.thursday"),
    t("ui3lib.cronReadable.days.friday"),
    t("ui3lib.cronReadable.days.saturday"),
  ];
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function describeTime(minute: string, hour: string): string | null {
  const m = Number(minute);
  const h = Number(hour);
  if (!Number.isInteger(m) || !Number.isInteger(h)) return null;
  if (m < 0 || m > 59 || h < 0 || h > 23) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

function describeDayOfWeek(dow: string): string | null {
  if (dow === "*" || dow === "?") return t("ui3lib.cronReadable.dow.everyDay");
  if (dow === "1-5") return t("ui3lib.cronReadable.dow.everyWeekday");
  if (dow === "0,6" || dow === "6,0" || dow === "0,7") return t("ui3lib.cronReadable.dow.everyWeekend");
  const parts = dow.split(",").map((part) => part.trim());
  const names = parts.map((part) => {
    const n = Number(part);
    if (!Number.isInteger(n)) return null;
    return dayNames()[n % 7];
  });
  if (names.some((name) => name === null)) return null;
  if (names.length === 1) return t("ui3lib.cronReadable.dow.every", { day: names[0] });
  const joined = t("ui3lib.cronReadable.dow.listAnd", {
    head: names.slice(0, -1).join(", "),
    last: names[names.length - 1],
  });
  return t("ui3lib.cronReadable.dow.everyList", { days: joined });
}

export function describeCron(expression: string | null | undefined): string | null {
  if (!expression) return null;
  const trimmed = expression.trim();
  const fields = trimmed.split(/\s+/);
  // Standard 5-field cron: minute hour day-of-month month day-of-week
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;

  // Every N minutes
  const everyMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyMinutes && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return t("ui3lib.cronReadable.everyMinutes", { n: everyMinutes[1] });
  }

  // Every N hours, on the minute
  const everyHours = hour.match(/^\*\/(\d+)$/);
  if (everyHours && /^\d+$/.test(minute) && dom === "*" && month === "*" && dow === "*") {
    return t("ui3lib.cronReadable.everyHours", { n: everyHours[1], minute: pad2(Number(minute)) });
  }

  // Hourly
  if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return t("ui3lib.cronReadable.everyHour", { minute: pad2(Number(minute)) });
  }

  // Daily / weekly at a fixed time
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && month === "*") {
    const time = describeTime(minute, hour);
    if (!time) return null;
    if (dom === "*" && (dow === "*" || dow === "?")) {
      return t("ui3lib.cronReadable.everyDayAt", { time });
    }
    if (dom === "*") {
      const dowText = describeDayOfWeek(dow);
      if (dowText) return t("ui3lib.cronReadable.dayAt", { day: `${dowText[0].toUpperCase()}${dowText.slice(1)}`, time });
    }
    if (/^\d+$/.test(dom) && (dow === "*" || dow === "?")) {
      return t("ui3lib.cronReadable.dayOfMonth", { dom, time });
    }
  }

  return null;
}
