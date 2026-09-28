import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const extension of ['mjs', 'cjs']) {
  test(`installed ${extension} conversion clamps overflow and preserves soft edges`, () => {
    const source = readFileSync(new URL(`../node_modules/@imgly/background-removal/dist/index.${extension}`, import.meta.url), 'utf8');
    const conversion = source.match(/function convertFloat32ToUint8\(float32Array\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(conversion);
    const input = { data: [-0.02, -0.005, 0, 0.25, 0.5, 0.75, 1, 1.005, 1.02], shape: [9] };
    const output = vm.runInNewContext(`${conversion}; convertFloat32ToUint8(input)`, {
      input, import_ndarray2: { default: (data, shape) => ({ data, shape }) }
    });
    assert.deepEqual(Array.from(output.data), [0, 0, 0, 63, 127, 191, 255, 255, 255]);
  });
}
