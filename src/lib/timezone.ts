/** All display times use the California (Pacific) timezone. */
export const TZ = "America/Los_Angeles";

/** Returns "YYYY-MM-DD" for "today" in Pacific time. */
export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Returns "YYYY-MM-DD" for a given date in Pacific time. */
export function dateToPacificStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}
