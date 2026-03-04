import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { GeneratedWallet } from './walletGenerator';

export interface PDFGeneratorOptions {
  wallets: GeneratedWallet[];
  userName: string;
}

// Helper: fetch a TTF font and register it with jsPDF
async function loadCustomFonts(doc: jsPDF): Promise<boolean> {
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

export async function generateWalletsPDF({ wallets, userName }: PDFGeneratorOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Load Unicode-supporting font (Roboto) for š, č, ć, đ, ž etc.
  const hasCustomFont = await loadCustomFonts(doc);
  const fontFamily = hasCustomFont ? 'Roboto' : 'helvetica';

  for (let i = 0; i < wallets.length; i++) {
    if (i > 0) {
      doc.addPage();
    }

    const wallet = wallets[i];
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Title
    doc.setFontSize(20);
    doc.setFont(fontFamily, 'bold');
    doc.text('LANA Wallet', pageWidth / 2, 30, { align: 'center' });

    // User name (only on first page)
    if (i === 0) {
      doc.setFontSize(14);
      doc.setFont(fontFamily, 'normal');
      doc.text(userName, pageWidth / 2, 40, { align: 'center' });
    }

    // Wallet number
    doc.setFontSize(16);
    doc.setFont(fontFamily, 'bold');
    doc.text(`Lana8Wonder, Wallet ${i + 1}`, pageWidth / 2, i === 0 ? 55 : 45, { align: 'center' });

    let yPos = i === 0 ? 75 : 65;

    // Private Key (WIF) section
    doc.setFontSize(14);
    doc.setFont(fontFamily, 'bold');
    doc.text('LANA Private Key (WIF)', pageWidth / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('courier', 'normal'); // Keep courier for WIF keys (ASCII only)
    const privateKeyLines = doc.splitTextToSize(wallet.privateKey, contentWidth);
    doc.text(privateKeyLines, pageWidth / 2, yPos, { align: 'center' });

    yPos += (privateKeyLines.length * 5) + 5;

    // QR Code for Private Key
    try {
      const privateKeyQR = await QRCode.toDataURL(wallet.privateKey, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      const qrSize = 50;
      doc.addImage(privateKeyQR, 'PNG', (pageWidth - qrSize) / 2, yPos, qrSize, qrSize);
      yPos += qrSize + 15;
    } catch (error) {
      console.error('Error generating private key QR code:', error);
      yPos += 15;
    }

    // Wallet Address section
    doc.setFontSize(14);
    doc.setFont(fontFamily, 'bold');
    doc.text('LanaCoin ID Wallet', pageWidth / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('courier', 'normal'); // Keep courier for addresses (ASCII only)
    const addressLines = doc.splitTextToSize(wallet.address, contentWidth);
    doc.text(addressLines, pageWidth / 2, yPos, { align: 'center' });

    yPos += (addressLines.length * 5) + 5;

    // QR Code for Address
    try {
      const addressQR = await QRCode.toDataURL(wallet.address, {
        width: 300,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      const qrSize = 50;
      doc.addImage(addressQR, 'PNG', (pageWidth - qrSize) / 2, yPos, qrSize, qrSize);
      yPos += qrSize + 15;
    } catch (error) {
      console.error('Error generating address QR code:', error);
      yPos += 15;
    }

    // Warning box
    const warningYPos = doc.internal.pageSize.getHeight() - 45;
    doc.setDrawColor(255, 193, 7);
    doc.setFillColor(255, 243, 205);
    doc.rect(margin, warningYPos, contentWidth, 30, 'FD');

    doc.setFontSize(10);
    doc.setFont(fontFamily, 'bold');
    doc.text('IMPORTANT SECURITY NOTICE', pageWidth / 2, warningYPos + 6, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont(fontFamily, 'normal');
    const warningText = 'This document stores your wallet in THREE secure locations. Keep it in a fire-proof safe, in a location inaccessible to unauthorized individuals. Anyone with access to the private key can access the associated funds. Never share your private key with anyone.';
    const warningLines = doc.splitTextToSize(warningText, contentWidth - 10);
    doc.text(warningLines, pageWidth / 2, warningYPos + 12, { align: 'center', maxWidth: contentWidth - 10 });
  }

  // Save the PDF
  doc.save(`Lana8Wonder_Wallets_${new Date().getTime()}.pdf`);
}
