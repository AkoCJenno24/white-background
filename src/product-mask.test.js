import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanProductAlpha} from './product-mask.js';
test('solid product cleanup removes connected thin seam and restores label holes',()=>{
 const w=100,h=100,a=new Uint8Array(w*h);
 for(let y=10;y<90;y++)for(let x=20;x<70;x++)a[y*w+x]=255;
 for(let y=65;y<95;y++) a[y*w+70+(y-65)]=255;
 for(let y=30;y<60;y++)for(let x=30;x<60;x++)a[y*w+x]=30;
 a[5*w+5]=255;
 const out=cleanProductAlpha(a,w,h);
 assert.equal(out[45*w+45],255);
 assert.equal(out[80*w+85],0);
 assert.equal(out[5*w+5],0);
 assert.equal(out[70*w+50],255);
});
test('empty and very small masks remain safe',()=>{
 const empty=new Uint8Array(100);
 assert.deepEqual(Array.from(cleanProductAlpha(empty,10,10)),Array.from(empty));
 assert.throws(()=>cleanProductAlpha(empty,1,1),/dimensions/);
});
test('sparse opaque box keeps its thin outer outline and restores its interior',()=>{
 const w=100,h=100,a=new Uint8Array(w*h);
 for(let y=5;y<95;y++){a[y*w+30]=255;a[y*w+69]=255;}
 for(let x=30;x<70;x++){a[5*w+x]=255;a[94*w+x]=255;}
 for(let y=40;y<50;y++)for(let x=40;x<60;x++)a[y*w+x]=255;
 const out=cleanProductAlpha(a,w,h);
 assert.equal(out[25*w+50],255);
 assert.equal(out[90*w+65],255);
 assert.equal(out[50*w+75],0);
});
