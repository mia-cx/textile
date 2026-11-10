/** A Discord timestamp for today, `minutes` after midnight: "Today at 9:12 AM", rolling over hours as Discord does. */
export function today(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const minute = String(minutes % 60).padStart(2, '0')
  return `Today at ${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
}
