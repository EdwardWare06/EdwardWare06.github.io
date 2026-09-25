import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starLayout, yearLabels } from '../../assets/js/timeline.js';

test('stars run left to right inside the sky', () => {
  const pts = starLayout(10, 1000, 600);
  assert.equal(pts.length, 10);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i][0] > pts[i - 1][0]);
  for (const [x, y] of pts) assert.ok(x > 0 && x < 1000 && y > 0 && y < 600);
});
test('the path rises toward the future', () => {
  const pts = starLayout(10, 1000, 600);
  assert.ok(pts[9][1] < pts[0][1]);
});
test('a single star sits in the middle', () => {
  assert.deepEqual(starLayout(1, 100, 100)[0].map(Math.round), [50, 49]);
});
test('a year label appears where the year changes', () => {
  const whens = ['2024', 'Spring 2024', 'Fall 2024 – Spring 2025', 'May – Aug 2025', 'Sept – Oct 2025', 'Oct 2025 – now', 'Fall 2025 – now', '2026', '2028', '2029'];
  assert.deepEqual(yearLabels(whens), [[0, '2024'], [3, '2025'], [7, '2026'], [8, '2028'], [9, '2029']]);
});
