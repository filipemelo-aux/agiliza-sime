import { format, isValid, parseISO } from "date-fns";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
  return parsed ? format(parsed, "yyyy-MM-dd") : null;
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
  return format(parsed, pattern);
};

/**
 * Safely parse a date-only string from the DB into a Date object.
 * Always uses T12:00:00 to avoid UTC timezone shift.
 */
export const safeParseDateISO = (input?: string | null): Date | null => {
  return parseDateInput(input);
};
