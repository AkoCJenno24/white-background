import test from 'node:test';
import assert from 'node:assert/strict';
import {findBoxOutline, fitBottomCurve} from './box-outline.js';

test('original-image edges recover a box clipped by the model mask',()=>{
 const w=180,h=260,rgb=new Uint8ClampedArray(w*h*4),alpha=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const inside=x>=50&&x<120&&y>=15&&y<245;
  const i=(y*w+x)*4;rgb[i]=rgb[i+1]=rgb[i+2]=inside?210:100;rgb[i+3]=255;
  if(x>=52&&x<115&&y>=18&&y<243)alpha[y*w+x]=255;
 }
 const outline=findBoxOutline(rgb,alpha,w,h);
 assert.ok(outline);
 const expected=[[49.5,14.5],[119.5,14.5],[119.5,244.5],[49.5,244.5]];
 [...outline.slice(0,3),outline.at(-1)].forEach((p,i)=>p.forEach((v,j)=>assert.ok(Math.abs(v-expected[i][j])<.1)));
});
test('no edges means no invented rectangular outline',()=>{
 const w=180,h=260,rgb=new Uint8ClampedArray(w*h*4).fill(130),alpha=new Uint8Array(w*h);
 for(let y=15;y<245;y++)for(let x=50;x<120;x++)alpha[y*w+x]=255;
 assert.equal(findBoxOutline(rgb,alpha,w,h),null);
});
test('bottom refinement follows a bowed rim instead of cutting a straight chord',()=>{
 const points=Array.from({length:120},(_,x)=>[x,240+5*Math.sin(Math.PI*x/119)]);
 const curve=fitBottomCurve(points);
 assert.ok(curve);
 assert.ok(curve.at(60)>244.5);
 assert.ok(curve.at(5)<241.5);
 assert.ok(curve.at(114)<241.5);
 assert.equal(fitBottomCurve(points.map(([x,y])=>[x,y+(Math.floor(x/8)%2?20:0)])),null);
});
test('short switches to the inner rim cannot cut a notch into the bottom',()=>{
 const points=Array.from({length:160},(_,x)=>[x,x>=40&&x<70?265:271]);
 const curve=fitBottomCurve(points);
 assert.ok(curve);
 for(let x=0;x<160;x++)assert.ok(curve.at(x)>=270.5);
});

