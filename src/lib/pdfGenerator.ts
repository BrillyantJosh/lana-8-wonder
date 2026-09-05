import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import i18n from 'i18next';
import { GeneratedWallet } from './walletGenerator';

export interface PDFGeneratorOptions {
  wallets: GeneratedWallet[];
  userName: string;
}

// Helper: fetch a TTF font and register it with jsPDF.
// Exported so every PDF this app produces gets the same Unicode-capable face
// (Slovenian s/c/z carons, Hungarian long umlauts) instead of helvetica.
export async function loadCustomFonts(doc: jsPDF): Promise<boolean> {
  try {
    // Load Roboto Regular
    const regularRes = await fetch('/fonts/Roboto-Regular.ttf');
    if (!regularRes.ok) throw new Error('Failed to fetch Roboto-Regular.ttf');
    const regularBuffer = await regularRes.arrayBuffer();
    const regularBytes = new Uint8Array(regularBuffer);
    let regularBase64 = '';
    for (let i = 0; i < regularBytes.length; i += 8192) {
      regularBase64 += String.fromCharCode(...regularBytes.subarray(i, i + 8192));
    }
    regularBase64 = btoa(regularBase64);

    doc.addFileToVFS('Roboto-Regular.ttf', regularBase64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');

    // Load Roboto Bold
    const boldRes = await fetch('/fonts/Roboto-Bold.ttf');
    if (!boldRes.ok) throw new Error('Failed to fetch Roboto-Bold.ttf');
    const boldBuffer = await boldRes.arrayBuffer();
    const boldBytes = new Uint8Array(boldBuffer);
    let boldBase64 = '';
    for (let i = 0; i < boldBytes.length; i += 8192) {
      boldBase64 += String.fromCharCode(...boldBytes.subarray(i, i + 8192));
    }
    boldBase64 = btoa(boldBase64);

    doc.addFileToVFS('Roboto-Bold.ttf', boldBase64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');

    return true;
  } catch (error) {
    console.error('Failed to load custom fonts, falling back to helvetica:', error);
    return false;
  }
}

/* ── the engraved wallet sheet ─────────────────────────────────────────────
 *
 * The same page lanapaper.online prints for a Lana8Wonder wallet: a mandala
 * crown at the top, a compass rose at the foot, and between them nothing but
 * the two codes, as large as an A4 sheet allows.
 *
 * Everything below is measured in millimetres on an A4 page. The numbers are
 * not adjustable by eye — the crown and the motif are placed, so the middle of
 * the sheet is always the same empty rectangle, and the layout was fitted to
 * that rectangle rather than to whatever gap a picture happened to leave.
 */

const PAGE = { w: 210, h: 297 };
const CROWN = { h: 64, top: 14, aspect: 1.0436 };
const FOOT = { h: 13, bottom: 279, aspect: 1.0024 };

/** The writing area: 166 × 176 mm, clear of both pieces of engraving. */
const A = {
  x0: 22,
  x1: 188,
  cx: 105,
  leftX0: 22,
  leftCx: 60,
  rightX0: 112,
  rightCx: 150,
  colW: 76,
};

const GARAMOND = 'EBGaramond';
const MONO = 'JetBrainsMono';
const ELLIPSIS = '…';

const FACES = [
  { url: '/fonts/EBGaramond-Regular.ttf', vfs: 'EBGaramond-Regular.ttf', family: GARAMOND, style: 'normal' },
  { url: '/fonts/EBGaramond-SemiBold.ttf', vfs: 'EBGaramond-SemiBold.ttf', family: GARAMOND, style: 'bold' },
  { url: '/fonts/JetBrainsMono-Regular.ttf', vfs: 'JetBrainsMono-Regular.ttf', family: MONO, style: 'normal' },
];

/**
 * jsPDF's built-in faces are WinAnsi and have no 'č' — they would silently
 * mangle four of the five languages this site speaks, so the faces have to be
 * embedded. Fetched once per page load, not once per export.
 */
let facesPending: Promise<string[]> | null = null;

function fetchAsBase64(url: string): Promise<string> {
  return fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Chunked: a single String.fromCharCode.apply over a 490 KB buffer throws.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x2000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
    }
    return btoa(binary);
  });
}

function loadEngravedFaces(): Promise<string[]> {
  if (!facesPending) {
    facesPending = Promise.all(FACES.map((f) => fetchAsBase64(f.url))).catch((err) => {
      facesPending = null; // a failed load must not poison every later export
      throw err;
    });
  }
  return facesPending;
}

async function registerEngravedFonts(doc: jsPDF): Promise<void> {
  const data = await loadEngravedFaces();
  FACES.forEach((face, i) => {
    doc.addFileToVFS(face.vfs, data[i]);
    doc.addFont(face.vfs, face.family, face.style);
  });
}

/** Both pieces of engraving, fetched once and reused by alias on every page. */
const assets = new Map<string, Promise<string>>();

function loadOrnament(url: string): Promise<string> {
  let pending = assets.get(url);
  if (!pending) {
    pending = fetchAsBase64(url)
      .then((b64) => `data:image/png;base64,${b64}`)
      .catch((err) => {
        assets.delete(url);
        throw err;
      });
    assets.set(url, pending);
  }
  return pending;
}

/**
 * Steps the size down by 0.5 pt until the string fits, never below the floor,
 * then truncates. The baseline never moves, so a long name in German does not
 * push the codes down the page.
 */
function fitOneLine(
  doc: jsPDF,
  content: string,
  family: string,
  style: 'normal' | 'bold',
  startPt: number,
  maxMm: number,
  floorPt: number,
): { text: string; size: number } {
  doc.setFont(family, style);
  let size = startPt;
  doc.setFontSize(size);
  while (doc.getTextWidth(content) > maxMm && size > floorPt) {
    size = Math.max(floorPt, size - 0.5);
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(content) <= maxMm) return { text: content, size };
  let out = content;
  while (out.length > 1 && doc.getTextWidth(out + ELLIPSIS) > maxMm) out = out.slice(0, -1);
  return { text: out + ELLIPSIS, size };
}

/** Fixed character offsets, so the break sits in the same place on every sheet. */
function splitAt(s: string, at: number): [string, string] {
  const cut = s.length === at * 2 ? at : Math.ceil(s.length / 2);
  return [s.slice(0, cut), s.slice(cut)];
}

function drawText(
  doc: jsPDF,
  content: string,
  x: number,
  y: number,
  align: 'left' | 'center' | 'right',
  family: string,
  style: 'normal' | 'bold',
  size: number,
): void {
  if (!content) return;
  doc.setFont(family, style);
  doc.setFontSize(size);
  doc.text(content, x, y, { align });
}

/** Pure black on transparent, at more than 12 px per millimetre. */
function qr(content: string, level: 'M' | 'Q'): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: level,
    margin: 0,
    scale: 20,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

export async function generateWalletsPDF({ wallets, userName }: PDFGeneratorOptions): Promise<void> {
  const t = i18n.t.bind(i18n);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    // Mandatory: without it the greyscale engraving is stored raw and one sheet
    // costs megabytes. jsPDF also stores an aliased image once, however many
    // pages draw it.
    compress: true,
  });

  await registerEngravedFonts(doc);
  const [crown, footMotif] = await Promise.all([
    loadOrnament('/ornaments/l8w-crown.png'),
    loadOrnament('/ornaments/l8w-footer.png'),
  ]);

  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFillColor(0, 0, 0);

  const total = wallets.length;

  for (let i = 0; i < total; i++) {
    if (i > 0) doc.addPage('a4', 'portrait');
    const wallet = wallets[i];

    // ── the engraving ──────────────────────────────────────────────────
    const crownW = CROWN.h * CROWN.aspect;
    doc.addImage(crown, 'PNG', PAGE.w / 2 - crownW / 2, CROWN.top, crownW, CROWN.h, 'crown-l8w', 'FAST');
    const footW = FOOT.h * FOOT.aspect;
    doc.addImage(footMotif, 'PNG', PAGE.w / 2 - footW / 2, FOOT.bottom - FOOT.h, footW, FOOT.h, 'foot-l8w', 'FAST');

    // ── who and what ───────────────────────────────────────────────────
    drawText(doc, 'Lana8Wonder', A.cx, 92, 'center', GARAMOND, 'bold', 26);

    const tagline = fitOneLine(doc, t('walletPdf.tagline'), GARAMOND, 'normal', 12, A.x1 - A.x0, 9);
    drawText(doc, tagline.text, A.cx, 100, 'center', GARAMOND, 'normal', tagline.size);

    // A set is numbered so the sheets can be told apart and kept in order.
    drawText(
      doc,
      t('walletPdf.position', { n: i + 1, total }),
      A.cx, 108, 'center', MONO, 'normal', 14,
    );

    const owner = fitOneLine(doc, userName || '', GARAMOND, 'bold', 18, A.x1 - A.x0, 11);
    drawText(doc, owner.text, A.cx, 122, 'center', GARAMOND, 'bold', owner.size);

    // ── the two codes ──────────────────────────────────────────────────
    // Told apart without colour: the address is on the LEFT under an OUTLINED
    // bar with the smaller code; the private key is on the RIGHT under a SOLID
    // BLACK bar with reversed type, and its code is the bigger of the two. A
    // solid black tab survives a photocopier and every kind of colour blindness.
    const BAR_Y = 140;
    const BAR_H = 10;
    doc.setLineWidth(0.3);
    doc.rect(A.leftX0, BAR_Y, A.colW, BAR_H, 'S');
    const addrCaption = fitOneLine(doc, t('walletPdf.walletAddress'), GARAMOND, 'bold', 13, A.colW - 6, 8);
    drawText(doc, addrCaption.text, A.leftCx, BAR_Y + 7, 'center', GARAMOND, 'bold', addrCaption.size);

    doc.rect(A.rightX0, BAR_Y, A.colW, BAR_H, 'F');
    const keyCaption = fitOneLine(doc, t('walletPdf.privateKey'), GARAMOND, 'bold', 13, A.colW - 6, 8);
    doc.setTextColor(255, 255, 255);
    drawText(doc, keyCaption.text, A.rightCx, BAR_Y + 7, 'center', GARAMOND, 'bold', keyCaption.size);
    doc.setTextColor(0);

    const receive = fitOneLine(doc, t('walletPdf.scanToReceive'), GARAMOND, 'normal', 9.5, A.colW, 7);
    drawText(doc, receive.text, A.leftCx, 157, 'center', GARAMOND, 'normal', receive.size);
    const spend = fitOneLine(doc, t('walletPdf.scanToSpend'), GARAMOND, 'normal', 9.5, A.colW, 7);
    drawText(doc, spend.text, A.rightCx, 157, 'center', GARAMOND, 'normal', spend.size);

    // The address can be re-derived from the key, so it can afford level M; the
    // key cannot be recovered from anything, so it gets Q's 25 % damage tolerance.
    const [addressQr, keyQr] = await Promise.all([
      qr(wallet.address, 'M'),
      qr(wallet.privateKey, 'Q'),
    ]);

    const ADDR_QR = 58;
    const KEY_QR = 70;
    const QR_TOP = 161;
    doc.addImage(addressQr, 'PNG', A.leftCx - ADDR_QR / 2, QR_TOP, ADDR_QR, ADDR_QR, `qr-a-${i}`, 'FAST');
    doc.addImage(keyQr, 'PNG', A.rightCx - KEY_QR / 2, QR_TOP, KEY_QR, KEY_QR, `qr-k-${i}`, 'FAST');

    // Broken once, at a fixed offset, so a person reading it back always finds
    // the break in the same place.
    const [a1, a2] = splitAt(wallet.address, 17);
    drawText(doc, a1, A.leftCx, QR_TOP + ADDR_QR + 9, 'center', MONO, 'normal', 12);
    drawText(doc, a2, A.leftCx, QR_TOP + ADDR_QR + 15.5, 'center', MONO, 'normal', 12);

    const [k1, k2] = splitAt(wallet.privateKey, 26);
    drawText(doc, k1, A.rightCx, QR_TOP + KEY_QR + 9, 'center', MONO, 'normal', 12);
    drawText(doc, k2, A.rightCx, QR_TOP + KEY_QR + 15.5, 'center', MONO, 'normal', 12);

    // ── the one line that has to be here ───────────────────────────────
    const safety = fitOneLine(doc, t('walletPdf.keySafety'), GARAMOND, 'normal', 9.5, A.x1 - A.x0, 7);
    drawText(doc, safety.text, A.cx, 253, 'center', GARAMOND, 'normal', safety.size);
  }

  doc.save(`Lana8Wonder_Wallets_${new Date().getTime()}.pdf`);
}
