import { readFile, writeFile } from 'node:fs/promises';

// IMG.LY 1.7.0 converts unbounded model predictions into Uint8Array values.
// Uint8Array wraps over/underflow, producing holes and background speckles.
// Clamp before conversion; do not threshold away soft edges or change RGB.
const original = 'uint8Array[i] = float32Array.data[i] * 255;';
const corrected = 'uint8Array[i] = Math.max(0, Math.min(255, float32Array.data[i] * 255));';
for (const extension of ['mjs', 'cjs']) {
  const path = new URL(`../node_modules/@imgly/background-removal/dist/index.${extension}`, import.meta.url);
  const source = await readFile(path, 'utf8');
  if (source.includes(corrected)) continue;
  if (source.split(original).length !== 2) throw new Error('Background-removal library changed: review the alpha conversion patch.');
  await writeFile(path, source.replace(original, corrected));
}
console.log('Background-removal alpha bounds verified.');
