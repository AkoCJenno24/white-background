// Refine a tall, straight-sided package against ORIGINAL image edges.
// The AI mask only supplies search bounds; it is not trusted as the final edge.
export function fitBottomCurve(points) {
  if(points.length<20)return null;
  const median=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
  const samples=[];
  const size=Math.max(3,Math.ceil(points.length/16));
  for(let i=0;i<points.length;i+=size){const group=points.slice(i,i+size);samples.push([median(group.map(p=>p[0])),[...group.map(p=>p[1])].sort((a,b)=>a-b)[Math.floor((group.length-1)*.85)]]);}
  // Bridge short inward jumps to the inner rim using neighboring exterior
  // evidence. A median alone can preserve a multi-sample notch.
  const local=(values,i,fn)=>fn(...values.slice(Math.max(0,i-2),Math.min(values.length,i+3)));
  const heights=samples.map(p=>p[1]);
  const outer=heights.map((_,i)=>local(heights,i,Math.max));
  const closed=outer.map((_,i)=>local(outer,i,Math.min));
  const smoothed=samples.map((p,i)=>[p[0],i===0||i===samples.length-1?p[1]:closed[i]]);
  samples.splice(0,samples.length,...smoothed);
  // Reject erratic edges rather than fitting an arbitrary background structure.
  for(let i=1;i<samples.length;i++)if(Math.abs(samples[i][1]-samples[i-1][1])>5)return null;
  if(Math.max(...samples.map(p=>p[1]))-Math.min(...samples.map(p=>p[1]))>12)return null;
  const at=x=>{
    let i=1;while(i<samples.length-1&&x>samples[i][0])i++;
    const p=samples[i-1],q=samples[i];
    const t=Math.max(0,Math.min(1,(x-p[0])/(q[0]-p[0])));
    return p[1]+t*(q[1]-p[1]);
  };
  if(points.filter(p=>Math.abs(p[1]-at(p[0]))<=8).length<points.length*.75)return null;
  return {samples,at};
}

function fitLine(points) {
  let kept = points;
  let a = 0, b = 0;
  for (let pass = 0; pass < 4; pass++) {
    if (kept.length < 12) return null;
    const n=kept.length, sx=kept.reduce((s,p)=>s+p[0],0), sy=kept.reduce((s,p)=>s+p[1],0);
    const sxx=kept.reduce((s,p)=>s+p[0]*p[0],0), sxy=kept.reduce((s,p)=>s+p[0]*p[1],0);
    a=(n*sxy-sx*sy)/(n*sxx-sx*sx); b=(sy-a*sx)/n;
    const errors=kept.map(p=>Math.abs(p[1]-a*p[0]-b)).sort((x,y)=>x-y);
    const limit=Math.max(1.2, errors[Math.floor(errors.length*.5)]*2.5);
    kept=kept.filter(p=>Math.abs(p[1]-a*p[0]-b)<=limit);
  }
  const good=points.filter(p=>Math.abs(p[1]-a*p[0]-b)<2);
  if(good.length < points.length*.75 || Math.abs(a)>.12) return null;
  return {a,b};
}

export function findBoxOutline(rgb, alpha, w, h) {
  let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha[y*w+x]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const bw=x1-x0,bh=y1-y0;
  if(bw<40||bh<100||bw/bh>.65)return null;
  const radius=Math.max(8,Math.round(w*.025));
  const contrast=(x,y,vertical)=>{
    let score=0;
    for(let c=0;c<3;c++){
      const p=(y*w+x)*4+c;
      const q=((y+(vertical?0:1))*w+x+(vertical?1:0))*4+c;
      const d=rgb[p]-rgb[q];score+=d*d;
    }
    return Math.sqrt(score);
  };
  function scan(vertical, from, to, expected, outward, curved=false){
    const points=[];
    for(let t=Math.ceil(from);t<=to;t+=Math.max(1,Math.floor((to-from)/120))){
      let best=-Infinity, coordinate=expected; const candidates=[];
      for(let s=Math.round(expected-radius);s<=expected+radius;s++){
        const x=vertical?s:t,y=vertical?t:s;
        if(x<3||y<3||x>=w-3||y>=h-3)continue;
        const score=contrast(x,y,vertical)-Math.abs(s-expected)*.15;
        candidates.push([s,score]);
        if(score>best){best=score;coordinate=s;}
      }
      if(best>8){
        // A colored rim can have a stronger inner edge than its true exterior.
        // Follow the outer edge of this local gradient band, not the inner rim.
        const band=candidates.filter(([s,score])=>Math.abs(s-coordinate)<=5&&score>=best*.4);
        coordinate=outward<0?Math.min(...band.map(p=>p[0])):Math.max(...band.map(p=>p[0]));
        points.push([t,coordinate+.5]);
      }
    }
    if(!curved)return fitLine(points);
    const curve=fitBottomCurve(points);
    if(curve)return curve;
    // Preserve the previous straight-edge path when curved fitting is rejected.
    const line=fitLine(points);
    return line ? {samples:[],at:x=>line.a*x+line.b} : null;
  }
  const left=scan(true,y0+bh*.12,y1-bh*.12,x0,-1),right=scan(true,y0+bh*.12,y1-bh*.12,x1,1);
  const top=scan(false,x0+bw*.12,x1-bw*.12,y0,-1),bottom=scan(false,x0+bw*.02,x1-bw*.02,y1,1,true);
  if(!left||!right||!top||!bottom)return null;
  const intersect=(side,end)=>{const y=(end.a*side.b+end.b)/(1-end.a*side.a);return [side.a*y+side.b,y];};
  const bottomCorner=side=>{let y=y1;for(let i=0;i<4;i++)y=bottom.at(side.a*y+side.b);return [side.a*y+side.b,y];};
  const br=bottomCorner(right),bl=bottomCorner(left);
  const contour=bottom.samples.filter(p=>p[0]>bl[0]&&p[0]<br[0]).reverse();
  const points=[intersect(left,top),intersect(right,top),br,...contour,bl];
  if(points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=w||y>=h))return null;
  return points;
}




