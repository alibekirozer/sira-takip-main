export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function ensure24Hour(timeStr) {
  if (!timeStr) return '';
  const parsed = new Date(`1970-01-01 ${timeStr}`);
  if (isNaN(parsed)) return timeStr;
  return formatTime(parsed);
}
