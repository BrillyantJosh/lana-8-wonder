/**
 * Reads the codes back off a rendered page, the way a phone would.
 *
 * Usage:  node tools/verify-pdf-qr.mjs <pagesDir> <expected.json>
 *
 * <pagesDir> holds page-NN.png rasterised from the exported PDF; expected.json
 * is [{ page, kind, position, address, wif }]. Every page's two QR codes are
 * decoded with the same jsqr the app's scanner uses and compared against the
 * strings that page was supposed to carry. A paper wallet whose code does not
 * match its own ink is money that cannot be recovered, so this is the check
 * that matters most — and the only one that exercises the whole path:
 * key -> address -> PDF -> paper -> scanner.
 *
 * Exits non-zero on any mismatch.
 */
import { readFileSync, existsSync } from 'fs';
import { inflateSync } from 'zlib';
import jsQR from 'jsqr';

function parsePNG(buf) {
  let p = 8; const idat = [];
  let width = 0, height = 0, colorType = 0, bitDepth = 0;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.slice(p, p + 4).toString(); p += 4;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p); height = buf.readUInt32BE(p + 4);
      bitDepth = buf[p + 8]; colorType = buf[p + 9];
    } else if (type === 'IDAT') idat.push(buf.slice(p, p + len));
    else if (type === 'IEND') break;
    p += len + 4;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      let cur = raw[off + x];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upLeft = (x >= channels && y > 0) ? pixels[rowStart - stride + x - channels] : 0;
      if (filter === 1) cur = (cur + left) & 0xff;
      else if (filter === 2) cur = (cur + up) & 0xff;
      else if (filter === 3) cur = (cur + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const pred = left + up - upLeft;
        const pa = Math.abs(pred - left), pb = Math.abs(pred - up), pc = Math.abs(pred - upLeft);
        const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
        cur = (cur + pr) & 0xff;
      }
      pixels[rowStart + x] = cur;
    }
    off += stride;
  }
  return { width, height, channels, pixels };
}

/** Crops a page-fraction rectangle out as RGBA, which is what jsqr wants. */
function cropRGBA(img, fx, fy, fw, fh) {
  const x0 = Math.floor(fx * img.width), y0 = Math.floor(fy * img.height);
  const w = Math.floor(fw * img.width), h = Math.floor(fh * img.height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * img.width + (x0 + x)) * img.channels;
      const d = (y * w + x) * 4;
      const r = img.pixels[s];
      const g = img.channels >= 3 ? img.pixels[s + 1] : r;
      const b = img.channels >= 3 ? img.pixels[s + 2] : r;
      out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

// The two code windows, as fractions of an A4 page, with a margin around the
// drawn size so a slight change in the layout still lands inside the crop.
const PAGE_W = 210, PAGE_H = 297;
const win = (x, y, w, h, pad = 4) => [
  (x - pad) / PAGE_W, (y - pad) / PAGE_H, (w + pad * 2) / PAGE_W, (h + pad * 2) / PAGE_H,
];
// Kept in step with generateWalletsPDF in src/lib/pdfGenerator.ts: the address
// code is ADDR_QR wide centred on A.leftCx, the key code KEY_QR on A.rightCx,
// both with their top at QR_TOP. Move them there and these move too, or every
// page reports a mismatch.
const ADDRESS_WINDOW = win(60 - 58 / 2, 161, 58, 58);
const KEY_WINDOW = win(150 - 70 / 2, 161, 70, 70);

const [dir, expectedPath] = process.argv.slice(2);
if (!dir || !expectedPath) {
  console.error('usage: node tools/verify-pdf-qr.mjs <pagesDir> <expected.json>');
  process.exit(64);
}

const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
let failed = 0;

for (const want of expected) {
  const file = `${dir}/page-${String(want.page).padStart(2, '0')}.png`;
  if (!existsSync(file)) {
    console.log(`page ${want.page}: MISSING ${file}`);
    failed++;
    continue;
  }
  const img = parsePNG(readFileSync(file));
  const read = (window) => {
    const c = cropRGBA(img, ...window);
    const found = jsQR(c.data, c.width, c.height);
    return found ? found.data : null;
  };
  const gotAddress = read(ADDRESS_WINDOW);
  const gotKey = read(KEY_WINDOW);

  const okAddress = gotAddress === want.address;
  const okKey = gotKey === want.wif;
  if (okAddress && okKey) {
    console.log(`page ${String(want.page).padStart(2)}  ${want.kind}/${want.position}  ok  ${want.address.slice(0, 10)}…`);
  } else {
    failed++;
    console.log(`page ${want.page}  ${want.kind}/${want.position}  MISMATCH`);
    if (!okAddress) console.log(`   address: read ${gotAddress ?? '(nothing)'}\n            want ${want.address}`);
    if (!okKey) console.log(`   key:     read ${gotKey ?? '(nothing)'}\n            want ${want.wif}`);
  }
}

console.log('');
if (failed) {
  console.log(`${failed} of ${expected.length} pages do not read back correctly`);
  process.exit(1);
}
console.log(`${expected.length} pages: every code reads back as the key printed beside it`);
