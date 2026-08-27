import { jsPDF } from 'jspdf';
import { loadCustomFonts } from './pdfGenerator';
import type { PaymentInstructions } from './paymentInstructions';

/**
 * A one-page "take this to your bank" slip.
 *
 * It is deliberately fed the exact same objects the confirmation page renders
 * — the persisted reference and amount, and the PaymentInstructions built by
 * buildPaymentInstructions — so the paper and the screen cannot disagree.
 * All copy arrives pre-translated by the caller, which keeps the document in
 * whatever language the buyer is already reading.
 */

export interface PaymentSlipRow {
  label: string;
  value: string;
}

export interface PaymentSlipInput {
  heading: string;
  intro?: string;
  /** The headline pair: what to pay and under which reference. */
  amount?: PaymentSlipRow;
  reference?: PaymentSlipRow;
  /** Order facts (payee, wallet, date) shown under the headline. */
  summary: PaymentSlipRow[];
  instructions: PaymentInstructions | null;
  footerNotes: string[];
  fileName: string;
}

const PAGE_MARGIN = 18;

export async function generatePaymentSlipPDF(input: PaymentSlipInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const hasCustomFont = await loadCustomFonts(doc);
  const font = hasCustomFont ? 'Roboto' : 'helvetica';

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN + 6;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN + 6;
    }
  };

  // ---- Heading -------------------------------------------------------------
  doc.setFont(font, 'bold');
  doc.setFontSize(18);
  doc.text(input.heading, PAGE_MARGIN, y);
  y += 8;

  if (input.intro) {
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    const introLines = doc.splitTextToSize(input.intro, contentWidth) as string[];
    doc.text(introLines, PAGE_MARGIN, y);
    y += introLines.length * 5 + 3;
    doc.setTextColor(0);
  }

  // ---- Headline box: amount + reference ------------------------------------
  const headline = [input.amount, input.reference].filter(Boolean) as PaymentSlipRow[];
  if (headline.length > 0) {
    const boxHeight = 12 + headline.length * 13;
    ensureSpace(boxHeight + 6);
    doc.setDrawColor(180);
    doc.setFillColor(244, 244, 246);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, boxHeight, 2, 2, 'FD');

    let boxY = y + 11;
    for (const row of headline) {
      doc.setFont(font, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text(row.label, PAGE_MARGIN + 5, boxY);

      doc.setFont(font, 'bold');
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text(row.value, PAGE_MARGIN + 5, boxY + 7);
      boxY += 13;
    }
    y += boxHeight + 8;
  }

  // ---- Order summary -------------------------------------------------------
  const drawRow = (label: string, value: string) => {
    const labelWidth = 52;
    const valueLines = doc.splitTextToSize(value, contentWidth - labelWidth) as string[];
    const rowHeight = Math.max(5.5, valueLines.length * 5);
    ensureSpace(rowHeight + 2);

    doc.setFont(font, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(95);
    doc.text(label, PAGE_MARGIN, y);

    doc.setFont(font, 'bold');
    doc.setTextColor(0);
    doc.text(valueLines, PAGE_MARGIN + labelWidth, y);
    y += rowHeight + 1.5;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(14);
    y += 3;
    doc.setDrawColor(210);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    y += 6;
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(title, PAGE_MARGIN, y);
    y += 6;
  };

  for (const row of input.summary) {
    drawRow(row.label, row.value);
  }

  // ---- Bank details --------------------------------------------------------
  if (input.instructions) {
    drawSectionTitle(input.instructions.title);
    input.instructions.blocks.forEach((block, index) => {
      if (index > 0) {
        ensureSpace(8);
        y += 2;
        doc.setDrawColor(230);
        doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
        y += 5;
      }
      for (const line of block.lines) {
        drawRow(line.label, line.value);
      }
    });
  }

  // ---- Footer notes --------------------------------------------------------
  if (input.footerNotes.length > 0) {
    y += 4;
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    for (const note of input.footerNotes) {
      const noteLines = doc.splitTextToSize(note, contentWidth) as string[];
      ensureSpace(noteLines.length * 4.6 + 3);
      doc.text(noteLines, PAGE_MARGIN, y);
      y += noteLines.length * 4.6 + 3;
    }
    doc.setTextColor(0);
  }

  doc.save(input.fileName);
}
