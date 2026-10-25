const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weatherUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&temperature_unit=fahrenheit&timezone=auto&forecast_days=4';
}

// WMO weather interpretation codes, grouped coarsely.
export function iconFor(code) {
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code === 1 || code === 2) return { icon: '🌤', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫', label: 'Fog' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨', label: 'Snow' };
  if (code >= 95 && code <= 99) return { icon: '⛈', label: 'Storms' };
  return { icon: '☁️', label: 'Cloudy' };
}

// "2026-10-26" -> weekday, parsed as a local date (new Date(string) would read it as UTC).
function dayName(isoDate) {
  const parts = isoDate.split('-').map(Number);
  return DAY_NAMES[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
}

export function parseWeather(json) {
  const now = iconFor(json.current.weather_code);
  const daily = json.daily;
  const days = [];
  for (let i = 1; i <= 3 && i < daily.time.length; i++) {
    days.push({
      name: dayName(daily.time[i]),
      icon: iconFor(daily.weather_code[i]).icon,
      hi: Math.round(daily.temperature_2m_max[i]),
    });
  }
  return {
    now: { temp: Math.round(json.current.temperature_2m), icon: now.icon, label: now.label },
    hi: Math.round(daily.temperature_2m_max[0]),
    lo: Math.round(daily.temperature_2m_min[0]),
    days,
  };
}
