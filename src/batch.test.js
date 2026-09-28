import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { runQueue, createArchive, jpgName } from './batch.js';

test('processes sequentially, continues after failure, retries only failed work', async () => {
  const items = [1, 2, 3].map(id => ({ id, state: 'queued' }));
  const visited = [];
  let active = 0;
  await runQueue(items, async item => {
    assert.equal(++active, 1);
    visited.push(item.id);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (item.id === 2) throw new Error('Invalid image');
  });
  assert.deepEqual(visited, [1, 2, 3]);
  assert.deepEqual(items.map(item => item.state), ['done', 'failed', 'done']);
  items[1].state = 'queued';
  await runQueue(items, async item => visited.push(item.id));
  assert.deepEqual(visited, [1, 2, 3, 2]);
  assert.ok(items.every(item => item.state === 'done'));
});

test('ZIP preserves names, duplicate results and bytes, excluding failures', async () => {
  const items = ['photo.jpg', 'photo.png', 'PHOTO.JPG', 'other.webp'].map((name, i) => ({ file: {name}, state: 'done', output: new Blob([`image-${i}`]) }));
  items.push({ file: { name: 'failed.jpg' }, state: 'failed' });
  const archive = await createArchive(items);
  const zip = await JSZip.loadAsync(await archive.arrayBuffer(), { checkCRC32: true });
  assert.deepEqual(Object.values(zip.files).filter(file => !file.dir).map(file => file.name), ['photo.jpg', '2/photo.jpg', '3/PHOTO.JPG', 'other.jpg']);
  assert.equal(await zip.file('2/photo.jpg').async('string'), 'image-1');
  assert.equal(jpgName('66000401.jpg'), '66000401.jpg');
  await assert.rejects(createArchive([]), /no completed images/);
});
