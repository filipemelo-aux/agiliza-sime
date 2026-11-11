import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TZ_BRASIL = "America/Sao_Paulo";
const HAS_OFFSET_REGEX = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Reescreve um instante como o relógio de Brasília, para que a formatação
 * local mostre a data brasileira mesmo em máquinas com outro fuso.
 */
const toBrasiliaWallClock = (d: Date): Date => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_BRASIL, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  const hour = p.hour === "24" ? "00" : p.hour;
  const shifted = new Date(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`);
  return isValid(shifted) ? shifted : d;
};

/** true quando o valor traz o fuso explícito (Z ou ±hh:mm) — ou seja, é um instante. */
const isInstant = (input: Date | string) => !(typeof input === "string" && !HAS_OFFSET_REGEX.test(input));

/**
 * Safely parse a date input, using T12:00:00 for date-only strings
 * to prevent timezone offset issues (UTC midnight → previous day in UTC-3).
 */
const parseDateInput = (input?: Date | string | null): Date | null => {
  if (!input) return null;

  if (input instanceof Date) {
    return isValid(input) ? input : null;
  }

  // Date-only string: append T12:00:00 to avoid UTC midnight shift
  if (DATE_ONLY_REGEX.test(input)) {
    const parsed = new Date(`${input}T12:00:00`);
    return isValid(parsed) ? parsed : null;
  }

  const parsed = new Date(input);
  return isValid(parsed) ? parsed : null;
};

/**
 * Returns the current local date as yyyy-MM-dd, or converts a date input.
 */
export const getLocalDateISO = (input?: Date | string | null): string => {
  const date = parseDateInput(input) ?? new Date();
  return format(date, "yyyy-MM-dd");
};

/**
 * Normalizes any date input into yyyy-MM-dd format.
 */
export const normalizeDateInput = (input?: string | null): string | null => {
  if (!input) return null;
  if (DATE_ONLY_REGEX.test(input)) return input;

  const parsed = parseDateInput(input);
  if (!parsed) return null;
  return format(HAS_OFFSET_REGEX.test(input) ? toBrasiliaWallClock(parsed) : parsed, "yyyy-MM-dd");
};

/**
 * Safely format a date-only string (yyyy-MM-dd) or Date to dd/MM/yyyy.
 * This is the ONLY function that should be used to display dates from the DB.
 * Prevents the +1 day bug caused by UTC interpretation of date-only strings.
 */
export const formatDateBR = (input?: Date | string | null, pattern = "dd/MM/yyyy"): string => {
  if (!input) return "—";
  const parsed = parseDateInput(input);
  if (!parsed) return "—";
  return format(isInstant(input) ? toBrasiliaWallClock(parsed) : parsed, pattern, { locale: ptBR });
};

/**
 * Safely parse a date-only string from the DB into a Date object.
 * Always uses T12:00:00 to avoid UTC timezone shift.
 */
export const safeParseDateISO = (input?: string | null): Date | null => {
  return parseDateInput(input);
};

/**
 * Add N months to a date, preserving the original day-of-month.
 * If the target month doesn't have the original day (e.g. Jan 31 → Feb),
 * it clamps to the last day of the target month.
 */
export const addMonthsPreserveDay = (base: Date, months: number): Date => {
  const targetDay = base.getDate();
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  // If JS overflowed the month (e.g. Jan 31 + 1 month → Mar 3), clamp
  if (d.getDate() !== targetDay) {
    d.setDate(0); // last day of previous month
  }
  return d;
};
