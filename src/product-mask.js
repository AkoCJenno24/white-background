// Cleanup for one convex opaque package (box or tin), not arbitrary silhouettes.
import { findBoxOutline } from './box-outline.js';
function morphology(mask, width, height, radius, dilate) {
  let input = mask;
  for (const horizontal of [true, false]) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let value = dilate ? 0 : 1;
      for (let d = -radius; d <= radius; d++) {
        const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
        const v = xx >= 0 && yy >= 0 && xx < width && yy < height ? input[yy * width + xx] : 0;
        if (dilate ? v : !v) { value = dilate ? 1 : 0; break; }
      }
      out[y * width + x] = value;
    }
    input = out;
  }
  return input;
}

function hullMask(mask, width, height) {
  const points=[];
  for(let y=0;y<height;y++) {
    let left=-1,right=-1;
    for(let x=0;x<width;x++) if(mask[y*width+x]) {if(left<0)left=x;right=x;}
    if(left>=0){points.push([left,y]);if(right!==left)points.push([right,y]);}
  }
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(points.length<3)return mask;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const half=ps=>{const h=[];for(const p of ps){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h;};
  const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const hull=lower.concat(upper);
  const out=new Uint8Array(mask.length);
  for(let y=0;y<height;y++) {
    const xs=[];
    for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];if(a[1]===b[1]){if(y===a[1])xs.push(a[0],b[0]);}else if(y>=Math.min(a[1],b[1])&&y<=Math.max(a[1],b[1]))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    if(xs.length){const left=Math.max(0,Math.ceil(Math.min(...xs))),right=Math.min(width-1,Math.floor(Math.max(...xs)));for(let x=left;x<=right;x++)out[y*width+x]=1;}
  }
  return out;
}

export function cleanProductAlpha(alpha, width, height, radius = 6) {
  if (alpha.length !== width * height) throw new Error('Mask dimensions do not match.');
  const binary = Uint8Array.from(alpha, value => value >= 16 ? 1 : 0);
  let opened = morphology(morphology(binary, width, height, radius, false), width, height, radius, true);
  // A nearly transparent box can be reduced to its border and printed text.
  // Detect this sparse silhouette before opening destroys the narrow outline.
  const hull = hullMask(binary, width, height);
  const area = binary.reduce((sum,v)=>sum+v,0), hullArea=hull.reduce((sum,v)=>sum+v,0);
  const sparse = area > 0 && area / hullArea < 0.5;
  if(sparse) opened = hull;
  const labels = new Int32Array(alpha.length), queue = new Int32Array(alpha.length);
  let label = 0, largest = 0, largestSize = 0;
  const neighbors = (i, visit) => {
    const x = i % width;
    if (x) visit(i - 1); if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width); if (i < alpha.length - width) visit(i + width);
  };
  for (let i = 0; i < alpha.length; i++) {
    if (!opened[i] || labels[i]) continue;
    label++; let head = 0, tail = 1; queue[0] = i; labels[i] = label;
    while (head < tail) neighbors(queue[head++], n => { if (opened[n] && !labels[n]) { labels[n] = label; queue[tail++] = n; } });
    if (tail > largestSize) { largestSize = tail; largest = label; }
  }
  if (!largestSize) return alpha.slice();
  // If opening fragments a substantial part of the opaque package, preserve
  // the original outer envelope rather than keeping only one text fragment.
  const body = largestSize / area < 0.85 ? hull : hullMask(Uint8Array.from(labels, value => value === largest ? 1 : 0), width, height);
  // Flood only exterior background. Enclosed holes belong to the opaque label.
  const outside = new Uint8Array(alpha.length); let head = 0, tail = 0;
  const add = i => { if (!body[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) neighbors(queue[head++], add);
  const filled = Uint8Array.from(outside, value => value ? 0 : 1);
  const core = morphology(filled, width, height, 2, false);
  const edge = morphology(filled, width, height, 1, true);
  return Uint8ClampedArray.from(alpha, (value, i) => core[i] ? 255 : edge[i] ? Math.max(value, filled[i] ? 128 : 0) : 0);
}

export async function compositeProduct(original, cutout, cleanup) {
  const canvas = document.createElement('canvas'); canvas.width = original.width; canvas.height = original.height;
  const ctx = canvas.getContext('2d');
  if (!cleanup) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(cutout, 0, 0); return canvas; }
  const scale = Math.min(1, 1024 / Math.max(original.width, original.height));
  const mask = document.createElement('canvas'); mask.width = Math.round(original.width * scale); mask.height = Math.round(original.height * scale);
  const mc = mask.getContext('2d', {willReadFrequently:true}); mc.drawImage(cutout, 0, 0, mask.width, mask.height);
  const pixels = mc.getImageData(0, 0, mask.width, mask.height);
  const alpha = Uint8Array.from({length:mask.width * mask.height}, (_, i) => pixels.data[4 * i + 3]);
  const cleaned = cleanProductAlpha(alpha, mask.width, mask.height);
  mc.clearRect(0, 0, mask.width, mask.height);
  mc.drawImage(original, 0, 0, mask.width, mask.height);
  const box = findBoxOutline(mc.getImageData(0, 0, mask.width, mask.height).data, cleaned, mask.width, mask.height);
  if (box) {
    // Draw a full-resolution antialiased polygon, avoiding enlarged binary steps.
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.beginPath();
    box.forEach(([x,y],i)=>{const xx=x*canvas.width/mask.width,yy=y*canvas.height/mask.height;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});
    ctx.closePath(); ctx.clip(); ctx.drawImage(original,0,0); ctx.restore();
    mask.width=mask.height=0; return canvas;
  }
  for (let i = 0; i < cleaned.length; i++) { pixels.data[4*i] = pixels.data[4*i+1] = pixels.data[4*i+2] = 255; pixels.data[4*i+3] = cleaned[i]; }
  mc.putImageData(pixels, 0, 0);
  // Restore RGB from the original, not the already transparent cutout.
  ctx.drawImage(original, 0, 0); ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over'; mask.width = mask.height = 0;
  return canvas;
}



