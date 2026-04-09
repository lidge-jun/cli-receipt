const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function resolveMonth(monthArg = "current", now = new Date()) {
  if (monthArg === "current") {
    return {
      year: now.getFullYear(),
      monthIndex: now.getMonth(),
      label: formatMonth(now.getFullYear(), now.getMonth())
    };
  }
  if (!MONTH_PATTERN.test(monthArg)) {
    throw new Error(`Invalid month "${monthArg}". Use "current" or YYYY-MM.`);
  }
  const [yearRaw, monthRaw] = monthArg.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Invalid month "${monthArg}". Month must be 01-12.`);
  }
  return {
    year,
    monthIndex,
    label: formatMonth(year, monthIndex)
  };
}

export function resolvePeriod(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const window = options.window || "month";

  if (window === "month") {
    const month = resolveMonth(options.month, now);
    const start = startOfLocalDay(new Date(month.year, month.monthIndex, 1));
    const end = endOfLocalDay(new Date(month.year, month.monthIndex + 1, 0));
    return {
      type: "month",
      label: month.label,
      fileLabel: month.label,
      title: `${month.label} monthly usage`,
      year: month.year,
      monthIndex: month.monthIndex,
      start,
      end
    };
  }

  if (window === "last30") {
    const end = endOfLocalDay(now);
    const start = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    const endLabel = toIsoDate(end);
    return {
      type: "last30",
      label: "Last 30 days",
      fileLabel: `last30-${endLabel}`,
      title: `Last 30 days ending ${endLabel}`,
      start,
      end
    };
  }

  throw new Error(`Invalid window "${window}". Use "month" or "last30".`);
}

export function formatMonth(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function toIsoDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function isInMonth(input, month) {
  const date = input instanceof Date ? input : new Date(input);
  return date.getFullYear() === month.year && date.getMonth() === month.monthIndex;
}

export function isInPeriod(input, period) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return false;
  if (period.type === "month") {
    return isInMonth(date, period);
  }
  return date >= period.start && date <= period.end;
}

export function monthCalendar(year, monthIndex) {
  const days = [];
  const current = new Date(Date.UTC(year, monthIndex, 1));
  while (current.getUTCMonth() === monthIndex) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

export function periodCalendar(period) {
  if (period.type === "month") {
    return monthCalendar(period.year, period.monthIndex);
  }

  const days = [];
  const current = new Date(period.start);
  while (current <= period.end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function startOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}
