export function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
}
