import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

// Patterns only (see disclosure.test.js for the real guard).
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
const STREET = /\b\d{1,5}\s+[NSEW]\.?\s+[A-Z][a-z]+\s+(Ave|St|Rd|Blvd|Dr|Ln)\b/;

test('the resume page shows no phone number and no street address', () => {
  const text = readFileSync('resume/index.html', 'utf8').replace(/<[^>]+>/g, ' ');
  assert.equal(PHONE.test(text), false, 'phone number');
  assert.equal(STREET.test(text), false, 'street address');
  assert.ok(text.includes('edwardware2006@gmail.com'), 'email');
  assert.ok(text.includes('github.com/EdwardWare06'), 'GitHub');
});

test('the printed PDF exists and is a small PDF', () => {
  const buf = readFileSync('resume/Edward-Ware-Resume.pdf');
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  const kb = statSync('resume/Edward-Ware-Resume.pdf').size / 1024;
  assert.ok(kb > 20 && kb < 1024, `size ${kb.toFixed(0)} KB`);
});
