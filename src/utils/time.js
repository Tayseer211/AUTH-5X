// Time-zone-aware calendar helpers. The simulation is set in Mauritius, so
// dates are built and read in APP_TIMEZONE rather than the runtime's local
// zone — otherwise a browser or server elsewhere would shift payment days and
// banking hours, and with them the fraud scores.

export const APP_TIMEZONE = 'Indian/Mauritius'

const formatters = new Map()

function partsFormatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      }),
    )
  }
  return formatters.get(timeZone)
}

// Wall-clock parts of an instant in `timeZone`. `month` is 1–12.
export function zonedParts(value, timeZone = APP_TIMEZONE) {
  const parts = {}
  for (const { type, value: part } of partsFormatter(timeZone).formatToParts(new Date(value))) {
    if (type !== 'literal') parts[type] = Number(part)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

// Milliseconds the zone is ahead of UTC at instant `ms`.
function zoneOffset(ms, timeZone) {
  const p = zonedParts(ms, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

// The instant whose wall-clock time in `timeZone` is the given parts.
// Out-of-range values roll over like Date.UTC (day 0 = last day of the
// previous month, month 13 = January next year).
export function zonedDate({ year, month, day, hour = 0, minute = 0 }, timeZone = APP_TIMEZONE) {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute)
  let instant = wallClock - zoneOffset(wallClock, timeZone)
  const corrected = zoneOffset(instant, timeZone)
  if (wallClock - corrected !== instant) instant = wallClock - corrected
  return new Date(instant)
}

// `{ year, month }` shifted by `offset` months (month is 1–12).
export function addMonths({ year, month }, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

export function daysInMonth({ year, month }) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
