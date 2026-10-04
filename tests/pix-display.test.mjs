import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {createPixQrDataUrl} from '../public/js/vendor/pix-qr.js';
import {pixImageSource,pixExpiryText} from '../public/js/pix-display.js';

// Rasterize the simple rectangles in the generated SVG, then use an independent
// QR decoder. Comparing the decoded text verifies a scannable, unchanged code.
function decodeImage(source){
 assert.match(source,/^data:image\/svg\+xml;base64,/);
 const svg=Buffer.from(source.split(',')[1],'base64').toString();
 const size=Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]),scale=5,width=size*scale;
 const pixels=new Uint8ClampedArray(width*width*4).fill(255);
 for(const run of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)){
  const [x,y,length]=run.slice(1).map(Number);
  for(let row=y*scale;row<(y+1)*scale;row++)for(let col=x*scale;col<(x+length)*scale;col++){
   const offset=(row*width+col)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0;
  }
 }
 return jsQR(pixels,width,width,{inversionAttempts:'dontInvert'})?.data;
}

test('the local QR decodes to the exact original string, including a long Pix-style code',()=>{
 for(const text of ['SIMULAÇÃO TAPSTAR — NÃO É UM PIX — NÃO PAGAR','00020101021226 TESTE TAPSTAR NAO PAGAR '+('1234567890'.repeat(22))]){
  assert.equal(decodeImage(createPixQrDataUrl(text)),text);
 }
});

test('missing or broken provider images do not prevent an exact local QR',()=>{
 const text='SIMULACAO TAPSTAR - NAO E UM PIX - NAO PAGAR';
 for(const image of [null,undefined,'https://example.invalid/broken.png','not-an-image'])assert.equal(decodeImage(pixImageSource({text,image})),text);
 assert.throws(()=>createPixQrDataUrl(''));
 assert.throws(()=>createPixQrDataUrl('x'.repeat(4097)));
});

test('an explicit ISO expiry is shown in Portuguese and Brasília time',()=>{
 assert.equal(pixExpiryText('2026-10-05T21:04:03.000000Z'),'Validade: 05/10/2026 às 18:04');
 assert.equal(pixExpiryText(null),'Confira a validade no aplicativo do banco.');
});
