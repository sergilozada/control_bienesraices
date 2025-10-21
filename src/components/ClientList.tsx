import { useState } from 'react';
import { useAuth } from '@/context/FirebaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Edit, Trash2, Eye, Upload, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface ClientListProps {
  filterType?: 'pending' | 'overdue' | 'all';
}

interface Client {
  id: string;
  nombre1: string;
  nombre2?: string;
  dni1: string;
  dni2?: string;
  celular1?: string;
  celular2?: string;
  email1?: string;
  email2?: string;
  manzana: string;
  lote: string;
  metraje: number;
  montoTotal: number;
  formaPago: 'contado' | 'cuotas';
  inicial?: number;
  numeroCuotas?: number;
  fechaRegistro: string;
  cuotas?: Cuota[];
}

interface Cuota {
  numero: number;
  vencimiento: string;
  monto: number;
  mora: number;
  total: number;
  fechaPago?: string;
  estado: 'pendiente' | 'pagado' | 'vencido';
  voucher?: string | string[];
  boleta?: string | string[];
}

export default function ClientList({ filterType = 'all' }: ClientListProps) {
  const { clients, deleteClient, updateCuota, calculateMora, markCuotaAsPaid, updateCuotaAmount, updateCuotaDates, selectedClientId, setSelectedClientId, formatLocalISO, parseLocalDate } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string | null>(selectedClientId || null);
  const [editingCuota, setEditingCuota] = useState<{ clientId: string; type: 'amount' | 'date'; cuotaIndex?: number } | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editFecha, setEditFecha] = useState('');
  const [editingMora, setEditingMora] = useState<{ clientId: string; cuotaIndex: number } | null>(null);
  const [editMoraValue, setEditMoraValue] = useState('');
  // Initialize paymentDate as local ISO (yyyy-MM-dd) to avoid timezone shifts
  const [paymentDate, setPaymentDate] = useState(formatLocalISO());

  const getFilteredClients = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    switch (filterType) {
      case 'pending':
        return clients.filter(client => 
          client.cuotas?.some(cuota => {
       const vencimiento = new Date(cuota.vencimiento);
       const v = parseLocalDate(cuota.vencimiento);
       return v.getMonth() === currentMonth && 
         v.getFullYear() === currentYear &&
                   cuota.estado === 'pendiente' &&
                   cuota.numero > 0; // Excluir iniciales
          })
        );
      case 'overdue':
        return clients.filter(client => 
          client.cuotas?.some(cuota => {
       const v = parseLocalDate(cuota.vencimiento);
       // compare dates at local midnight
       const vencMid = new Date(v.getFullYear(), v.getMonth(), v.getDate());
       const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
       return vencMid.getTime() < todayMid.getTime() && 
                   cuota.estado === 'pendiente' &&
                   cuota.numero > 0; // Excluir iniciales
          })
        );
      default:
        return clients;
    }
  };

  const getClientStatus = (client: Client) => {
    if (!client.cuotas || client.cuotas.length === 0) return 'Sin cuotas';
    
    const cuotasPagadas = client.cuotas.filter((c: Cuota) => c.estado === 'pagado' && c.numero > 0).length;
    const totalCuotas = client.cuotas.filter((c: Cuota) => c.numero > 0).length;
    const cuotasPendientes = totalCuotas - cuotasPagadas;
    
    if (cuotasPendientes === 0) return 'Completado';
    return `Debe ${cuotasPendientes}`;
  };

  const handleDeleteClient = (clientId: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer.')) {
      deleteClient(clientId);
      toast.success('Cliente eliminado exitosamente');
    }
  };

  const handleEditCuotasAmount = () => {
    if (!editingCuota || editingCuota.type !== 'amount') return;
    
    const newMonto = parseFloat(editMonto);
    if (isNaN(newMonto) || newMonto <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }

    updateCuotaAmount(editingCuota.clientId, newMonto);
    setEditingCuota(null);
    setEditMonto('');
    toast.success('Montos de cuotas actualizados exitosamente');
  };

  const handleEditMoraSave = () => {
    if (!editingMora) return;
    const v = parseFloat(editMoraValue);
    if (isNaN(v) || v < 0) { toast.error('Ingrese un monto válido para la mora'); return; }
    // Update the specific cuota mora and total
    const client = clients.find(c => c.id === editingMora.clientId);
    if (!client || !client.cuotas) return;
    const cuota = client.cuotas[editingMora.cuotaIndex];
    if (!cuota) return;
    updateCuota(editingMora.clientId, editingMora.cuotaIndex, { mora: v, total: cuota.monto + v });
    setEditingMora(null);
    setEditMoraValue('');
    toast.success('Mora actualizada');
  };

  const handleEditCuotaDate = () => {
    if (!editingCuota || editingCuota.type !== 'date' || editingCuota.cuotaIndex === undefined) return;
    
    if (!editFecha) {
      toast.error('Ingrese una fecha válida');
      return;
    }

    // Usar la fecha exacta sin conversiones que puedan cambiar el día
    // Save exact date picked (format to yyyy-MM-dd) without timezone conversion
    updateCuotaDates(editingCuota.clientId, editingCuota.cuotaIndex, formatLocalISO(editFecha));
    setEditingCuota(null);
    setEditFecha('');
    toast.success('Fecha de vencimiento actualizada');
  };

  const handleMarkAsPaid = (clientId: string, cuotaIndex: number) => {
    // Ensure the paymentDate is passed as local ISO (yyyy-MM-dd)
    markCuotaAsPaid(clientId, cuotaIndex, paymentDate);
    toast.success('Cuota marcada como pagada');
  };

  const handleFileUpload = (clientId: string, cuotaIndex: number, fileType: 'voucher' | 'boleta') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true; // Permitir múltiples archivos
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const uploadedUrls: string[] = [];
        for (let i = 0; i < files.length; i++) {
          try {
            const file = files[i];
            // create a storage ref under clients/{clientId}/cuotas/{cuotaIndex}/{timestamp}_{filename}
            const path = `clients/${clientId}/cuotas/${cuotaIndex}/${Date.now()}_${file.name}`;
            const sRef = storageRef(storage, path);
            // upload as bytes
            const snapshot = await uploadBytes(sRef, file);
            const url = await getDownloadURL(snapshot.ref);
            uploadedUrls.push(url);
          } catch (err) {
            console.error('Error subiendo archivo:', err);
            toast.error('Error subiendo uno o más archivos');
          }
        }

        if (uploadedUrls.length > 0) {
          // Concatenar con existentes si las hay
          const client = clients.find(c => c.id === clientId);
          const existing = client?.cuotas ? client.cuotas[cuotaIndex]?.[fileType] : undefined;
          const merged = Array.isArray(existing) ? [...existing, ...uploadedUrls] : (existing ? [existing, ...uploadedUrls] : uploadedUrls);
          updateCuota(clientId, cuotaIndex, { [fileType]: merged });
          toast.success(`${uploadedUrls.length} ${fileType === 'voucher' ? 'voucher(s)' : 'boleta(s)'} subido(s) exitosamente`);
        }
      }
    };
    input.click();
  };

  const downloadAllFiles = (files: string | string[] | undefined, filenamePrefix: string) => {
    if (!files) return;
    const arr = Array.isArray(files) ? files : [files];
    // Create a zip-like multiple download by triggering each file download sequentially
    // For cross-origin URLs (Firebase Storage) the `download` attribute may be ignored.
    // Fetch each file as a blob (CORS must allow GET), then create an object URL and force download.
    (async () => {
      for (let i = 0; i < arr.length; i++) {
        const url = arr[i];
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
          const blob = await res.blob();
          // try to get extension from content-type
          const contentType = blob.type || '';
          let ext = '';
          if (contentType) {
            const parts = contentType.split('/');
            if (parts.length === 2) ext = '.' + parts[1].split('+')[0];
          }
          // fallback to extension from url
          if (!ext) {
            const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
            if (m) ext = '.' + m[1];
          }

          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = `${filenamePrefix}_${i}${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(objUrl);
        } catch (err) {
          console.error('Error downloading file', err);
          // Fallback: abrir en nueva pestaña para que el usuario pueda guardar manualmente
          try {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('No se pudo forzar la descarga por CORS; se ha abierto el archivo en una nueva pestaña. Use "Guardar como" para descargar.');
          } catch (e) {
            toast.error('Error al descargar uno o más archivos. Revise la consola.');
          }
        }
      }
    })();
  };

  const openAllFiles = (files: string | string[] | undefined) => {
    if (!files) return;
    const arr = Array.isArray(files) ? files : [files];
    arr.forEach(url => window.open(url, '_blank'));
  };

  const formatDate = (dateString: string) => {
    const d = parseLocalDate(dateString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const exportToPDF = (client: Client) => {
    (async () => {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      // Try to fetch logo and embed as base64
      const fetchImageAsDataURL = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return null;
        }
      };

      let logoData: string | null = null;
      try {
        logoData = await fetchImageAsDataURL('/logo.jpeg');
      } catch (err) {
        console.error('Error fetching logo:', err);
        logoData = null;
      }

      // Header: logo full width if available (wrapped to avoid throwing)
      let titleY = 20;
      if (logoData) {
        try {
          const imgProps = doc.getImageProperties(logoData);
          const imgW = pageWidth - 20; // 10mm margin each side
          const imgH = (imgProps.height * imgW) / imgProps.width;
          doc.addImage(logoData, 'JPEG', 10, 6, imgW, imgH);
          titleY = 6 + imgH + 6;
        } catch (err) {
          console.error('Error adding logo to PDF:', err);
          titleY = 20;
        }
      }

      // Title
      doc.setFontSize(16);
      doc.text('CRONOGRAMA DE PAGOS', pageWidth / 2, titleY, { align: 'center' });

      // Contact bar under title
      const contactY = titleY + 6;
      doc.setFontSize(10);
      const cobranzaPhone = '942252720';
      doc.setFillColor(255, 205, 0);
      doc.rect(20, contactY - 4, pageWidth - 40, 6, 'F');
      doc.setTextColor(0);
      doc.text(`Telefono de cobranza Villa Hermosa: ${cobranzaPhone}`, 25, contactY);

  // Client info block (left) and bank info block (right)
      const infoStartY = contactY + 8;
      doc.setFontSize(10);
      const leftX = 20;
      const rightX = pageWidth - 110;

  // Left column: client details (separate fields). Right column will show DNIs on same vertical start.
    const infoLineHeight = 6;
    let yInfo = infoStartY;
  doc.text(`Nombre 1: ${client.nombre1 || ''}`, leftX, yInfo); yInfo += infoLineHeight;
  if (client.nombre2) { doc.text(`Nombre 2: ${client.nombre2}`, leftX, yInfo); yInfo += infoLineHeight; }
  doc.text(`Celular 1: ${client.celular1 || ''}`, leftX, yInfo); yInfo += infoLineHeight;
  if (client.celular2) { doc.text(`Celular 2: ${client.celular2}`, leftX, yInfo); yInfo += infoLineHeight; }
  doc.text(`Gmail 1: ${client.email1 || ''}`, leftX, yInfo); yInfo += infoLineHeight;
  if (client.email2) { doc.text(`Gmail 2: ${client.email2}`, leftX, yInfo); yInfo += infoLineHeight; }
    doc.text(`Precio total: S/ ${client.montoTotal.toFixed(2)}`, leftX, yInfo); yInfo += infoLineHeight;
    doc.text(`Moneda: SOLES`, leftX, yInfo); yInfo += infoLineHeight;
    doc.text(`Proyecto: VILLA HERMOSA DE CARHUAZ`, leftX, yInfo); yInfo += infoLineHeight;
    doc.text(`Manzana: ${client.manzana}`, leftX, yInfo); yInfo += infoLineHeight;
    doc.text(`Lote: ${client.lote}`, leftX, yInfo); yInfo += infoLineHeight;
    doc.text(`Metraje: ${client.metraje} m2`, leftX, yInfo); yInfo += infoLineHeight;

  // Right column: DNIs aligned at top next to names (show second only if present)
  const dniX = rightX + 2;
  let yDni = infoStartY;
  doc.text(`DNI 1: ${client.dni1 || ''}`, dniX, yDni); yDni += infoLineHeight;
  if (client.dni2) { doc.text(`DNI 2: ${client.dni2}`, dniX, yDni); }

    // Right column: bank info box (reordered and sized to its content)
  const bankY = infoStartY + (infoLineHeight * 4) + 2; // moved a bit up
    doc.setFontSize(9);
    doc.setTextColor(0);
    const bankLines = [
      'N° DE CUENTA BCP',
      'Soles: 380065006811006',
      'CCI: 002-3801-0650-0681-00645',
      'SEGUNDO TEOFILO LOZADA VILLEGAS'
    ];
    // measure text width and height to draw a tight green box
    let maxBankTextWidth = 0;
    bankLines.forEach(l => {
      try {
        const w = doc.getTextWidth(l);
        if (w > maxBankTextWidth) maxBankTextWidth = w;
      } catch (e) {
        // fallback width
        if (l.length * 2 > maxBankTextWidth) maxBankTextWidth = l.length * 2;
      }
    });
    const bankPad = 4;
  const boxWidth = maxBankTextWidth + bankPad * 2;
    const boxHeight = (bankLines.length * infoLineHeight) + bankPad * 2;
  let boxX = rightX + 8; // move box a bit to the right
    // ensure the box doesn't overflow the right margin
    if (boxX + boxWidth > pageWidth - 10) boxX = pageWidth - 10 - boxWidth;
    doc.setFillColor(200, 230, 201);
    doc.rect(boxX, bankY - 2, boxWidth, boxHeight, 'F');
    // draw bank lines inside box
    let yBank = bankY + bankPad;
    doc.text(bankLines[0], boxX + bankPad, yBank); yBank += infoLineHeight;
    doc.text(bankLines[1], boxX + bankPad, yBank); yBank += infoLineHeight;
    doc.text(bankLines[2], boxX + bankPad, yBank); yBank += infoLineHeight;
    doc.setFont(undefined, 'bold');
    doc.text(bankLines[3], boxX + bankPad, yBank); doc.setFont(undefined, 'normal');

  // Table header start Y (leave ample space so nothing se solape)
  const tableStartY = bankY + boxHeight + 12;

      // Prepare table rows, computing mora (manual or calculated) and total per row
      const rows = (client.cuotas || []).map((cuota) => {
        const moraDisplayed = (typeof cuota.mora === 'number' && cuota.mora > 0) ? cuota.mora : calculateMora(cuota.vencimiento, cuota.monto);
        const totalForRow = cuota.monto + moraDisplayed;
        return [
          cuota.numero === 0 ? 'Inicial' : String(cuota.numero),
          formatDate(cuota.vencimiento),
          cuota.monto.toFixed(2),
          moraDisplayed.toFixed(2),
          totalForRow.toFixed(2),
          cuota.fechaPago ? formatDate(cuota.fechaPago) : '',
          cuota.estado,
          Array.isArray(cuota.voucher) ? String(cuota.voucher.length) : (cuota.voucher ? '1' : ''),
          Array.isArray(cuota.boleta) ? String(cuota.boleta.length) : (cuota.boleta ? '1' : '')
        ];
      });

      // Use autoTable if available, otherwise draw simple text table
      let tableEndY = tableStartY;
      try {
        const docWithAutoTable = doc as jsPDF & { autoTable: (options: Record<string, unknown>) => { finalY: number } };
          if (typeof docWithAutoTable.autoTable === 'function') {
          const res = docWithAutoTable.autoTable({
            startY: tableStartY,
            margin: { left: 20, right: 20 },
            head: [['N°','vencimiento','Monto','Mora','Total','Fecha de Pago','Estado','Vouchers','Boletas']],
            body: rows,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [0,102,204], textColor: 255 },
            alternateRowStyles: { fillColor: [245,245,245] },
            columnStyles: {
              1: { cellWidth: 26 }, // vencimiento
              2: { cellWidth: 18 }, // monto
              5: { cellWidth: 24 }, // Fecha de Pago
              6: { cellWidth: 20 }, // Estado
              7: { cellWidth: 18 }, // Vouchers
              8: { cellWidth: 14 }  // Boletas
            }
          });
          // If autoTable returns a finalY, use it to place totals immediately after the table
          if (res && typeof res.finalY === 'number') tableEndY = res.finalY + 6;
        } else {
          // Manual table drawing if autoTable not available
          // colWidths chosen to fit A4 content width (pageWidth - 40 = 170)
          // Reduce vencimiento and monto widths, widen vouchers/boletas
          // manual column widths tuned to sum to 170 (pageWidth - 40)
          const colWidths = [14, 26, 18, 14, 22, 24, 20, 18, 14]; // tuned widths, sum = 170
          const startX = 20;
          let y = tableStartY;
          const headerHeight = 8;
          // Draw header background in blue using the sum of column widths (avoid mismatch)
          doc.setFillColor(0,102,204);
          doc.setDrawColor(0,102,204);
          const headerWidth = colWidths.reduce((s, w) => s + w, 0);
          doc.rect(startX, y, headerWidth, headerHeight, 'F');
          doc.setTextColor(255);
          doc.setFontSize(9);
          // header labels (short)
          const headers = ['N°','vencimiento','Monto','Mora','Total','Fecha Pago','Estado','Vouchers','Boletas'];
          let x = startX;
          for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], x + 2, y + 6);
            x += colWidths[i];
          }
          y += headerHeight + 2;
          // rows
          doc.setTextColor(0);
          // Draw row borders and content
          rows.forEach(r => {
            x = startX;
            // draw cell rectangles for the row
            for (let i = 0; i < r.length; i++) {
              doc.setDrawColor(0,102,204);
              doc.rect(x, y - 2, colWidths[i], 10);
              const cellText = String(r[i]);
              const cellLines = doc.splitTextToSize(cellText, colWidths[i] - 4);
              doc.text(cellLines, x + 2, y + 6);
              x += colWidths[i];
            }
            y += 10;
            if (y > 270) { doc.addPage(); y = 20; }
          });
          tableEndY = y + 4; // set end position so totals go right after table
        }
      } catch (err) {
        console.error('autoTable error', err);
        // If something else fails, at least dump rows safely
        let y = tableStartY;
        doc.setFontSize(9);
        rows.forEach(r => {
          const line = r.join(' | ');
          const parts = doc.splitTextToSize(line, pageWidth - 40);
          doc.text(parts, 20, y);
          y += (parts.length * 6) + 2;
          if (y > 270) { doc.addPage(); y = 20; }
        });
        tableEndY = y + 4;
      }
      // Footer: totals and note, placed right after the table (tableEndY)
      try {
        let footerY = tableEndY;
        // If footer would overflow page, add a new page
        const pageH = doc.internal.pageSize.getHeight();
        if (footerY + 30 > pageH - 10) {
          doc.addPage();
          footerY = 20;
        }
        doc.setFontSize(10);
        const totalPagado = (client.cuotas || []).reduce((acc, c) => acc + ((c.estado === 'pagado') ? (c.total ?? c.monto) : 0), 0);
        const totalPendiente = (client.cuotas || []).reduce((acc, c) => acc + ((c.estado !== 'pagado') ? (c.total ?? c.monto) : 0), 0);
        doc.text(`Importe total pagado S/ ${totalPagado.toFixed(2)}`, 20, footerY);
        doc.text(`Importe pendiente S/ ${totalPendiente.toFixed(2)}`, 20, footerY + 6);
        // small green strip below totals
        // Draw totals
        doc.setFillColor(220, 240, 220);
        // NOTE: draw the green box exactly around the note text (with padding)
        const noteText = `NOTA: UNA VEZ CANCELADO LA CUOTA MENSUAL, ENVIAR FOTO DEL VOUCHER AL NUMERO DE COBRANZA: ${cobranzaPhone}`;
        const noteFontSize = 8; // smaller font to ensure fit
        doc.setFontSize(noteFontSize);
        // split note into lines that fit inside the content width
        const contentWidth = pageWidth - 30; // left/right padding
        const noteLines = doc.splitTextToSize(noteText, contentWidth);
        const lineHeight = 4.2; // approximate mm per line at this font size
        const boxPadding = 3;
        const boxHeight = (noteLines.length * lineHeight) + (boxPadding * 2);
        const boxX = 15;
        const boxY = footerY + 10;
        doc.setFillColor(220, 240, 220);
        doc.rect(boxX, boxY, contentWidth + (boxPadding * 2) - 2, boxHeight, 'F');
        doc.setTextColor(0);
        // draw note lines inside the box with a small left padding
        let currentY = boxY + boxPadding + lineHeight;
        noteLines.forEach(line => {
          doc.text(line, boxX + boxPadding, currentY);
          currentY += lineHeight;
        });
      } catch (err) {
        console.error('PDF footer error', err);
      }

      try {
        doc.save(`cronograma_${client.nombre1}_${client.dni1}.pdf`);
        toast.success('PDF descargado exitosamente');
      } catch (err) {
        console.error('Error saving PDF', err);
        toast.error('Error al generar el PDF. Revise la consola para más detalles.');
      }
    })();
  };

  const exportToExcel = (client: Client) => {
    (async () => {
      // Try to fetch logo as base64 to embed in the HTML
      const fetchImageAsDataURL = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return null;
        }
      };

      const logoData = await fetchImageAsDataURL('/logo.jpeg');

      const cobranzaPhone = '942252720';
      const rows: string[] = [];
      // Header with logo + title
      let headerHtml = '<div style="text-align:center;">';
      if (logoData) headerHtml += `<img src="${logoData}" style="width:100%;height:auto;"/>`;
      headerHtml += `<h2>CRONOGRAMA DE PAGOS</h2>`;
      headerHtml += `<div style="background:#ffd700;padding:4px;margin-bottom:6px;">Telefono de cobranza Villa Hermosa: ${cobranzaPhone}</div>`;
      headerHtml += '</div>';

      // Client and bank info with separate columns for names, DNIs, phones, emails
      let infoHtml = '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">';
  infoHtml += '<tr>';
  infoHtml += `<td style="vertical-align:top;width:60%;">`;
  infoHtml += '<table style="width:100%;">';
  infoHtml += `<tr><td><strong>Nombre 1</strong></td><td>${client.nombre1 || ''}</td></tr>`;
  if (client.nombre2) infoHtml += `<tr><td><strong>Nombre 2</strong></td><td>${client.nombre2}</td></tr>`;
  infoHtml += `<tr><td><strong>DNI 1</strong></td><td>${client.dni1 || ''}</td></tr>`;
  if (client.dni2) infoHtml += `<tr><td><strong>DNI 2</strong></td><td>${client.dni2}</td></tr>`;
  infoHtml += `<tr><td><strong>Celular 1</strong></td><td>${client.celular1 || ''}</td></tr>`;
  if (client.celular2) infoHtml += `<tr><td><strong>Celular 2</strong></td><td>${client.celular2}</td></tr>`;
  infoHtml += `<tr><td><strong>Gmail 1</strong></td><td>${client.email1 || ''}</td></tr>`;
  if (client.email2) infoHtml += `<tr><td><strong>Gmail 2</strong></td><td>${client.email2}</td></tr>`;
      infoHtml += `<tr><td><strong>Precio total</strong></td><td>S/ ${client.montoTotal.toFixed(2)}</td></tr>`;
      infoHtml += `<tr><td><strong>Moneda</strong></td><td>SOLES</td></tr>`;
      infoHtml += `<tr><td><strong>Proyecto</strong></td><td>VILLA HERMOSA DE CARHUAZ</td></tr>`;
      infoHtml += `<tr><td><strong>Manzana</strong></td><td>${client.manzana}</td></tr>`;
      infoHtml += `<tr><td><strong>Lote</strong></td><td>${client.lote}</td></tr>`;
      infoHtml += `<tr><td><strong>Metraje</strong></td><td>${client.metraje} m2</td></tr>`;
      infoHtml += '</table>';
      infoHtml += '</td>';
      // make bank box an inline green block sized to content
      infoHtml += `<td style="vertical-align:top;padding:8px;">
        <div style="display:inline-block;background:#c8e6c9;padding:8px;border-radius:2px;">
          <div style="font-size:12px;font-weight:600;">N° DE CUENTA BCP</div>
          <div>Soles: 380065006811006</div>
          <div>CCI: 002-3801-0650-0681-00645</div>
          <div style="margin-top:6px;font-weight:bold;">SEGUNDO TEOFILO LOZADA VILLEGAS</div>
        </div>
      </td>`;
      infoHtml += '</tr>';
      infoHtml += '</table>';

      // Table of cuotas
  let tableHtml = '<table border="1" style="width:100%;border-collapse:collapse;border:1px solid #0066cc;">';
  // Add width hints for columns so Estado and Boletas have more room
  tableHtml += '<tr style="background:#0066cc;color:#fff;">'
    + '<th style="width:6%;">N°</th>'
    + '<th style="width:12%;">vencimiento</th>'
    + '<th style="width:10%;">Monto</th>'
    + '<th style="width:8%;">Mora</th>'
    + '<th style="width:12%;">Total</th>'
    + '<th style="width:12%;">Fecha Pago</th>'
    + '<th style="width:18%;">Estado</th>'
    + '<th style="width:12%;">Vouchers</th>'
    + '<th style="width:10%;">Boletas</th>'
    + '</tr>';
      (client.cuotas || []).forEach(cuota => {
        const vouchersCount = Array.isArray(cuota.voucher) ? cuota.voucher.length : (cuota.voucher ? 1 : 0);
        const boletasCount = Array.isArray(cuota.boleta) ? cuota.boleta.length : (cuota.boleta ? 1 : 0);
        tableHtml += `<tr>
          <td>${cuota.numero === 0 ? 'Inicial' : cuota.numero}</td>
          <td>${formatDate(cuota.vencimiento)}</td>
          <td>S/ ${cuota.monto.toFixed(2)}</td>
          <td>S/ ${(cuota.mora ?? 0).toFixed(2)}</td>
          <td>S/ ${(cuota.total ?? (cuota.monto + (cuota.mora ?? 0))).toFixed(2)}</td>
          <td>${cuota.fechaPago ? formatDate(cuota.fechaPago) : ''}</td>
          <td>${cuota.estado}</td>
          <td>${vouchersCount > 0 ? vouchersCount + ' voucher(s)' : ''}</td>
          <td>${boletasCount > 0 ? boletasCount + ' boleta(s)' : ''}</td>
        </tr>`;
      });
      tableHtml += '</table>';

  // Footer note placed directly below the table
  const totalPagado = (client.cuotas || []).reduce((acc, c) => acc + ((c.estado === 'pagado') ? (c.total ?? c.monto) : 0), 0);
  const totalPendiente = (client.cuotas || []).reduce((acc, c) => acc + ((c.estado !== 'pagado') ? (c.total ?? c.monto) : 0), 0);
  const footerHtml = `
    <div style="margin-top:8px;">
      <div>Importe total pagado S/ ${totalPagado.toFixed(2)}</div>
      <div>Importe pendiente S/ ${totalPendiente.toFixed(2)}</div>
    </div>
    <div style="margin-top:6px;">
      <div style="display:inline-block;background:#c8e6c9;padding:6px;font-size:11px;">
        NOTA: UNA VEZ CANCELADO LA CUOTA MENSUAL, ENVIAR FOTO DEL VOUCHER AL NUMERO DE COBRANZA: ${cobranzaPhone}
      </div>
    </div>
  `;

  const fullHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>${headerHtml}${infoHtml}${tableHtml}${footerHtml}</body></html>`;

      const blob = new Blob([fullHtml], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cronograma_${client.nombre1}_${client.dni1}.xls`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel descargado exitosamente');
    })();
  };

  const filteredClients = getFilteredClients();

  return (
    <div className="space-y-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle>
            Total de clientes: {filteredClients.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nombres</TableHead>
                  <TableHead>DNIs</TableHead>
                  <TableHead>Celulares</TableHead>
                  <TableHead>Emails</TableHead>
                  <TableHead>Manzana</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Metraje</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Forma Pago</TableHead>
                  <TableHead>Inicial</TableHead>
                  <TableHead>Cuotas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Opciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client, index) => (
                  <TableRow key={client.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{client.nombre1} {client.nombre2}</TableCell>
                    <TableCell>{client.dni1} {client.dni2}</TableCell>
                    <TableCell>{client.celular1} {client.celular2}</TableCell>
                    <TableCell>{client.email1} {client.email2}</TableCell>
                    <TableCell>{client.manzana}</TableCell>
                    <TableCell>{client.lote}</TableCell>
                    <TableCell>{client.metraje} m²</TableCell>
                    <TableCell>S/ {client.montoTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={client.formaPago === 'contado' ? 'default' : 'secondary'}>
                        {client.formaPago}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {client.inicial ? `S/ ${client.inicial.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>{client.numeroCuotas || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getClientStatus(client)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                        <div className="flex space-x-2">
                        {client.cuotas && client.cuotas.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedClient(client.id); setSelectedClientId(client.id); }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Cuotas
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCuota({ clientId: client.id, type: 'amount' })}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteClient(client.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de cuotas */}
      {selectedClient && (
        <Dialog open={true} onOpenChange={() => { setSelectedClient(null); setSelectedClientId(null); }}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Detalle de Cuotas</span>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const client = clients.find(c => c.id === selectedClient);
                      if (client) exportToPDF(client);
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Exportar PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const client = clients.find(c => c.id === selectedClient);
                      if (client) exportToExcel(client);
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const client = clients.find(c => c.id === selectedClient);
              if (!client || !client.cuotas) return null;

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded">
                    <div><strong>Cliente:</strong> {client.nombre1} {client.nombre2}</div>
                    <div><strong>DNI:</strong> {client.dni1}</div>
                    <div><strong>Manzana:</strong> {client.manzana}</div>
                    <div><strong>Lote:</strong> {client.lote}</div>
                  </div>
                  
                  <div className="mb-4">
                    <Label htmlFor="paymentDate">Fecha de pago para marcar cuotas:</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>N°</TableHead>
                          <TableHead>Vencimiento</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Mora</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Fecha Pago</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acción</TableHead>
                          <TableHead>Voucher</TableHead>
                          <TableHead>Boleta</TableHead>
                          <TableHead>Editar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {client.cuotas.map((cuota, index) => {
                          // Para iniciales no hay mora
                          const moraCalculada = cuota.numero === 0 ? 0 : calculateMora(cuota.vencimiento, cuota.monto);
                          // Preferir mora manual si existe (>0)
                          const moraManual = (cuota.mora ?? 0) > 0 ? cuota.mora : 0;
                          const displayedMora = moraManual > 0 ? moraManual : moraCalculada;
                          // Mostrar siempre monto + mora (manual o calculada) para reflejar la deuda actual
                          const totalDisplayed = cuota.monto + displayedMora;
                          
                          return (
                            <TableRow key={index}>
                              <TableCell>
                                <Badge variant={cuota.numero === 0 ? 'secondary' : 'outline'}>
                                  {cuota.numero === 0 ? 'Inicial' : cuota.numero}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDate(cuota.vencimiento)}</TableCell>
                              <TableCell>S/ {cuota.monto.toFixed(2)}</TableCell>
                              <TableCell className="flex items-center space-x-2">
                                <span>S/ {displayedMora.toFixed(2)}</span>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingMora({ clientId: selectedClient!, cuotaIndex: index }); setEditMoraValue(displayedMora.toFixed(2)); }}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TableCell>
                              <TableCell>S/ {totalDisplayed.toFixed(2)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {cuota.fechaPago ? formatDate(cuota.fechaPago) : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  cuota.estado === 'pagado' ? 'default' : 
                                  cuota.estado === 'vencido' ? 'destructive' : 'secondary'
                                }>
                                  {cuota.estado}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {cuota.estado !== 'pagado' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleMarkAsPaid(selectedClient, index)}
                                  >
                                    Marcar Pagado
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleFileUpload(selectedClient, index, 'voucher')}>
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                  {(Array.isArray(cuota.voucher) ? cuota.voucher.length > 0 : !!cuota.voucher) && (
                                    <>
                                      <Button size="sm" variant="ghost" onClick={() => openAllFiles(cuota.voucher)}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => downloadAllFiles(cuota.voucher, `voucher_${client.dni1 || 'file'}_${index}`)}>
                                        <Download className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleFileUpload(selectedClient, index, 'boleta')}>
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                  {(Array.isArray(cuota.boleta) ? cuota.boleta.length > 0 : !!cuota.boleta) && (
                                    <>
                                      <Button size="sm" variant="ghost" onClick={() => openAllFiles(cuota.boleta)}>
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => downloadAllFiles(cuota.boleta, `boleta_${client.dni1 || 'file'}_${index}`)}>
                                        <Download className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingCuota({ clientId: selectedClient, type: 'date', cuotaIndex: index });
                                    setEditFecha(cuota.vencimiento);
                                  }}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de edición de montos */}
      {editingCuota && editingCuota.type === 'amount' && (
        <Dialog open={true} onOpenChange={() => setEditingCuota(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Monto de Cuotas</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nuevo monto por cuota:</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editMonto}
                  onChange={(e) => setEditMonto(e.target.value)}
                  placeholder="Ingrese el nuevo monto"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingCuota(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleEditCuotasAmount}>
                  Actualizar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de edición de fecha */}
      {editingCuota && editingCuota.type === 'date' && (
        <Dialog open={true} onOpenChange={() => setEditingCuota(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Fecha de Vencimiento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nueva fecha de vencimiento:</Label>
                <Input
                  type="date"
                  value={editFecha}
                  onChange={(e) => setEditFecha(e.target.value)}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingCuota(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleEditCuotaDate}>
                  Actualizar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de edición de Mora por cuota */}
      {editingMora && (
        <Dialog open={true} onOpenChange={() => setEditingMora(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Mora de la Cuota</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nuevo monto de mora:</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editMoraValue}
                  onChange={(e) => setEditMoraValue(e.target.value)}
                  placeholder="Ingrese el nuevo monto de mora"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingMora(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleEditMoraSave}>
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}