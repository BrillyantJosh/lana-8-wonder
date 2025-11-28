import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { GeneratedWallet } from './walletGenerator';

export interface PDFGeneratorOptions {
  wallets: GeneratedWallet[];
  userName: string;
}

export async function generateWalletsPDF({ wallets, userName }: PDFGeneratorOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

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
    doc.setFont('helvetica', 'bold');
    doc.text('LANA Wallet', pageWidth / 2, 30, { align: 'center' });

    // User name (only on first page)
    if (i === 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text(userName, pageWidth / 2, 40, { align: 'center' });
    }

    // Wallet number
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Lana8Wonder, Wallet ${i + 1}`, pageWidth / 2, i === 0 ? 55 : 45, { align: 'center' });

    let yPos = i === 0 ? 75 : 65;

    // Private Key (WIF) section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LANA Private Key (WIF)', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('courier', 'normal');
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
    doc.setFont('helvetica', 'bold');
    doc.text('LanaCoin ID Wallet', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('courier', 'normal');
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
    doc.setFont('helvetica', 'bold');
    doc.text('⚠ IMPORTANT SECURITY NOTICE ⚠', pageWidth / 2, warningYPos + 6, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const warningText = 'This document stores your wallet in THREE secure locations. Keep it in a fire-proof safe, in a location inaccessible to unauthorized individuals. Anyone with access to the private key can access the associated funds. Never share your private key with anyone.';
    const warningLines = doc.splitTextToSize(warningText, contentWidth - 10);
    doc.text(warningLines, pageWidth / 2, warningYPos + 12, { align: 'center', maxWidth: contentWidth - 10 });
  }

  // Save the PDF
  doc.save(`Lana8Wonder_Wallets_${new Date().getTime()}.pdf`);
}
