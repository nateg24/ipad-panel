import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weatherUrl, iconFor, parseWeather } from '../js/weather.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo.json', import.meta.url), 'utf8'));

test('weatherUrl asks Open-Meteo for Fahrenheit at the given spot', () => {
  const url = weatherUrl(44.52, -88.02);
  assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(url.includes('latitude=44.52'));
  assert.ok(url.includes('longitude=-88.02'));
  assert.ok(url.includes('temperature_unit=fahrenheit'));
  assert.ok(url.includes('forecast_days=4'));
});

test('iconFor maps WMO codes to emoji and labels', () => {
  assert.equal(iconFor(0).icon, '☀️');
  assert.equal(iconFor(0).label, 'Clear');
  assert.equal(iconFor(2).label, 'Partly cloudy');
  assert.equal(iconFor(63).label, 'Rain');
  assert.equal(iconFor(81).label, 'Rain');
  assert.equal(iconFor(73).label, 'Snow');
  assert.equal(iconFor(95).label, 'Storms');
  assert.equal(iconFor(999).icon, '☁️');
});

test('parseWeather rounds temps and lists the next 3 days by weekday', () => {
  assert.deepEqual(parseWeather(fixture), {
    now: { temp: 69, icon: '☀️', label: 'Clear' },
    hi: 69,
    lo: 55,
    days: [
      { name: 'Mon', icon: '☁️', hi: 56 },
      { name: 'Tue', icon: '🌧', hi: 58 },
      { name: 'Wed', icon: '☁️', hi: 69 },
    ],
  });
});
