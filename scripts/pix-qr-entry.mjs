import QRCode from 'qrcode/lib/core/qrcode.js';

// Encode the exact copy-and-paste string already received for this charge.
// Rendering is local: no external image service, fetch or payment creation.
export function createPixQrDataUrl(text){
 if(typeof text!=='string'||!text.trim()||text.length>4096)throw Error('Código Pix indisponível.');
 const matrix=QRCode.create(text,{errorCorrectionLevel:'M'}).modules;
 const margin=4,size=matrix.size+margin*2;
 let path='';
 for(let row=0;row<matrix.size;row++){
  for(let col=0;col<matrix.size;){
   if(!matrix.get(row,col)){col++;continue;}
   const start=col;while(col<matrix.size&&matrix.get(row,col))col++;
   const width=col-start;path+=`M${start+margin} ${row+margin}h${width}v1h-${width}z`;
  }
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
 return 'data:image/svg+xml;base64,'+btoa(svg);
}
