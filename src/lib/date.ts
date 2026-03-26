import { format, isValid, parseISO } from "date-fns";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDateInput = (input?: Date | string | null): Date | null => {
  if (!input) return null;

  if (input instanceof Date) {
    return isValid(input) ? input : null;
  }

  if (DATE_ONLY_REGEX.test(input)) {
    const parsed = parseISO(`${input}T00:00:00`);
    return isValid(parsed) ? parsed : null;
  }

  const parsed = new Date(input);
  return isValid(parsed) ? parsed : null;
};

export const getLocalDateISO = (input?: Date | string | null): string => {
  const date = parseDateInput(input) ?? new Date();
  return format(date, "yyyy-MM-dd");
};

export const normalizeDateInput = (input?: string | null): string | null => {
  if (!input) return null;
  if (DATE_ONLY_REGEX.test(input)) return input;

  const parsed = parseDateInput(input);
  return parsed ? format(parsed, "yyyy-MM-dd") : null;
};
