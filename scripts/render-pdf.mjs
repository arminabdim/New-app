// Renders a generated PDF page to PNG for visual verification (Node only).
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

const [,, pdfPath, outPng, pageNum = '1'] = process.argv;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjs.getDocument({
  data,
  standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname,
  isEvalSupported: false,
  useWorkerFetch: false,
  disableFontFace: true,
}).promise;
const page = await doc.getPage(parseInt(pageNum, 10));
const vp = page.getViewport({ scale: 1.5 });
const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
fs.writeFileSync(outPng, await canvas.encode('png'));
console.log('rendered', outPng, vp.width, vp.height);
