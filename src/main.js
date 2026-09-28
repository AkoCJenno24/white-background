import './style.css';
import { jpgName, runQueue, createArchive } from './batch.js';
import { compositeProduct } from './product-mask.js';

const $ = id => document.getElementById(id);
let items = [], selected, remover;
let busy = false, zipping = false;
const showError = message => { $('status').textContent = message; $('status').hidden = false; };
const clearError = () => { $('status').hidden = true; $('status').textContent = ''; };

$('choose').onclick = $('replace').onclick = () => $('file').click();
$('file').onchange = () => { const files = [...$('file').files]; $('file').value = ''; addFiles(files); };
$('retry').onclick = () => { if (!busy && selected?.state === 'failed') { selected.state = 'queued'; processQueue(); } };
$('retry-all').onclick = () => retryFailed();
$('refine').onclick = async () => {
  if (busy || zipping || !selected || selected.state !== 'done') return;
  const item = selected, previous = {output:item.output, resultUrl:item.resultUrl};
  item.cleanup = $('product-mode').checked; busy = true; clearError();
  item.state = 'processing'; render();
  try { await processItem(item); item.state = 'done'; URL.revokeObjectURL(previous.resultUrl); }
  catch (error) { Object.assign(item, previous); item.state = 'done'; showError(`Refinement failed; your previous result is kept. ${error.message}`); }
  finally { busy = false; render(); }
};
$('clear').onclick = () => {
  if (busy || zipping) return;
  for (const item of items) { if (item.originalUrl) URL.revokeObjectURL(item.originalUrl); if (item.resultUrl) URL.revokeObjectURL(item.resultUrl); }
  items = []; selected = undefined; clearError(); render();
};
const zone = $('dropzone');
['dragenter', 'dragover'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove('dragging'); }));
zone.addEventListener('drop', event => addFiles([...event.dataTransfer.files]));
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());

function addFiles(files) {
  if (busy || zipping || !files.length) return;
  clearError();
  if (items.length + files.length > 50) return showError('Please keep each batch to 50 images or fewer. Download and clear this batch before adding more.');
  if ([...items.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0) > 200 * 1024 * 1024) return showError('Please keep each batch under 200 MB. Download and clear this batch before adding more.');
  const added = files.map(file => ({ file, cleanup: $('product-mode').checked, state: 'queued', error: '', progress: '', output: null }));
  items.push(...added); selected = added[0]; processQueue();
}

function render() {
  const done = items.filter(item => item.state === 'done').length;
  const failed = items.filter(item => item.state === 'failed').length;
  $('upload-view').hidden = items.length > 0;
  $('editor').hidden = $('batch-panel').hidden = !items.length;
  $('replace').disabled = $('file').disabled = $('clear').disabled = busy || zipping;
  $('retry-all').hidden = !failed;
  $('retry-all').disabled = busy || zipping;
  $('download-all').disabled = !done || busy || zipping;
  $('product-mode').disabled = busy || zipping;
  $('refine').hidden = selected?.state !== 'done'; $('refine').disabled = busy || zipping;
  $('batch-progress').max = items.length || 1;
  $('batch-progress').value = done + failed;
  $('batch-summary').textContent = `${done} of ${items.length} ready${failed ? ` · ${failed} failed` : ''}${busy ? ' · Processing' : ''}`;
  $('batch-list').replaceChildren(...items.map(item => {
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'batch-row';
    row.setAttribute('aria-pressed', String(item === selected));
    const name = document.createElement('span'); name.textContent = item.file.name;
    const state = document.createElement('span'); state.className = `item-state ${item.state}`;
    state.textContent = ({queued:'Waiting',processing:'Processing…',done:'Ready',failed:'Failed'})[item.state];
    row.append(name, state); row.onclick = () => { selected = item; render(); };
    return row;
  }));
  if (!selected) {
    $('original').removeAttribute('src'); $('result').removeAttribute('src'); $('download').removeAttribute('href'); return;
  }
  const item = selected;
  $('filename').textContent = item.file.name;
  $('original').hidden = !item.originalUrl;
  if (item.originalUrl) $('original').src = item.originalUrl;
  else $('original').removeAttribute('src');
  $('result').hidden = $('ready').hidden = $('download').hidden = item.state !== 'done';
  if (item.resultUrl) { $('result').src = item.resultUrl; $('download').href = item.resultUrl; $('download').download = jpgName(item.file.name); }
  else { $('result').removeAttribute('src'); $('download').removeAttribute('href'); }
  $('processing').hidden = item.state === 'done';
  $('processing').querySelector('.spinner').hidden = item.state !== 'processing';
  $('processing-label').textContent = item.state === 'failed' ? item.error : item.state === 'queued' ? 'Waiting to process…' : item.progress || 'Preparing image…';
  $('processing').querySelector('small').textContent = item.state === 'failed' ? 'Retry this image or continue with the completed images.' : 'Images are processed one at a time. The first takes longer.';
  $('dimensions').textContent = item.width ? `${item.width} × ${item.height} px · JPG` : '';
  $('retry').hidden = item.state !== 'failed'; $('retry').disabled = busy || zipping;
}

async function processItem(item) {
  const file = item.file;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Please choose a non-empty image smaller than 20 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Please choose another file.'); }
  try {
    if (bitmap.width * bitmap.height > 25000000 || bitmap.width > 8192 || bitmap.height > 8192) throw new Error('Use an image up to 25 megapixels and 8,192 pixels per side.');
    item.width = bitmap.width; item.height = bitmap.height;
  } finally { bitmap.close(); }
  item.originalUrl ??= URL.createObjectURL(file);
  item.progress = 'Preparing background remover…'; render();
  let cutout, original, canvas;
  try {
    remover ??= (await import('@imgly/background-removal')).removeBackground;
    const blob = await remover(file, {
      // The quantized model produces noisy masks on pale product labels.
      model: 'isnet_fp16', device: 'cpu', proxyToWorker: true,
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => {
        item.progress = key.startsWith('fetch:') && total > 0 && current < total
          ? `Downloading image model… ${Math.round(current / total * 100)}%` : 'Removing background…';
        if (item === selected) $('processing-label').textContent = item.progress;
      },
    });
    item.progress = 'Adding white background…'; render();
    cutout = await createImageBitmap(blob);
    original = await createImageBitmap(file);
    canvas = await compositeProduct(original, cutout, item.cleanup);
    item.output = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Export failed')), 'image/jpeg', 0.98));
    item.resultUrl = URL.createObjectURL(item.output);
  } catch (error) {
    console.error('Background removal failed:', error);
    throw new Error('Could not process this image. Check your connection and retry, or try a smaller image.');
  } finally { cutout?.close(); original?.close(); if (canvas) canvas.width = canvas.height = 0; }
}

async function processQueue() {
  if (busy || zipping) return { success: false, reason: 'Please wait for the current operation.' };
  if (!items.some(item => item.state === 'queued')) return { success: false, reason: 'No images are waiting.' };
  busy = true; clearError(); render();
  try { await runQueue(items, processItem, render); }
  finally { busy = false; render(); }
  return { success: true, completed: items.filter(item => item.state === 'done').length, failed: items.filter(item => item.state === 'failed').length };
}

function retryFailed() {
  if (busy || zipping) return { success: false, reason: 'Please wait for the current operation.' };
  items.filter(item => item.state === 'failed').forEach(item => item.state = 'queued');
  return processQueue();
}

$('download-all').onclick = async () => {
  if (busy || zipping) return;
  zipping = true; clearError(); render(); $('download-all').textContent = 'Preparing ZIP…';
  try {
    const blob = await createArchive(items, meta => { $('download-all').textContent = `Preparing ZIP… ${Math.round(meta.percent)}%`; });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'white-background-images.zip';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { showError(`ZIP download failed: ${error.message}. You can still download images individually.`); }
  finally { zipping = false; $('download-all').textContent = 'Download all (ZIP)'; render(); }
};

if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'retry_failed_images', description: 'Retry failed images in the current batch sequentially, keeping completed JPG results.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false },
      execute: input => {
        if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Expected an empty object.');
        return retryFailed();
      }
    })).catch(console.warn);
  } catch (error) { console.warn(error); }
}
