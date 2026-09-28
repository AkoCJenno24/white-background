import JSZip from 'jszip';

export function jpgName(name) {
  return /\.jpg$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, '')}.jpg`;
}

export async function runQueue(items, process, changed = () => {}) {
  for (const item of items) {
    if (item.state !== 'queued') continue;
    item.state = 'processing'; changed(item);
    try {
      await process(item);
      item.state = 'done'; item.error = '';
    } catch (error) {
      item.state = 'failed'; item.error = error.message || 'Could not process this image.';
    }
    changed(item);
  }
}

export async function createArchive(items, onProgress = () => {}) {
  const zip = new JSZip();
  const used = new Set();
  for (const item of items.filter(item => item.state === 'done')) {
    // Keep duplicate filenames in numbered folders instead of overwriting results.
    const name = jpgName(item.file.name).replace(/[\\/]/g, '_');
    let path = name;
    let folder = 2;
    while (used.has(path.toLowerCase())) path = `${folder++}/${name}`;
    used.add(path.toLowerCase());
    zip.file(path, await item.output.arrayBuffer());
  }
  if (!used.size) throw new Error('There are no completed images to download yet.');
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, onProgress);
}
