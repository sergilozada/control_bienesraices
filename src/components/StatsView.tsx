import { useState } from 'react';
import { useAuth } from '@/context/FirebaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'sonner';

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

interface StatsViewProps {
  showReport?: boolean;
}

interface RegistroDetalle {
  fecha: string;
  nombre: string;
  dni: string;
  manzana: string;
  lote: string;
  formaPago: string;
  montoTotal: number;
  inicial: number;
}

export default function StatsView({ showReport = false }: StatsViewProps) {
  const { clients } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const getMonthStats = (month: number, year: number) => {
    const today = new Date();
    let totalCuotas = 0;
    let cuotasAdelantadas = 0;
    let montoAdelantadas = 0;
    let cuotasPagadas = 0;
    let montoPagadas = 0;
    let cuotasPendientes = 0;
    let montoPendientes = 0;
    let montoProyectado = 0;
    let montoIngresado = 0;

    clients.forEach(client => {
      // Solo procesar clientes que NO sean de contado para estadísticas
      if (client.formaPago !== 'contado' && client.cuotas) {
        client.cuotas.forEach(cuota => {
          // Solo contar cuotas regulares (número > 0), no la inicial
          if (cuota.numero > 0) {
            const vencimiento = new Date(cuota.vencimiento);
            
            // Cuotas del mes seleccionado
            if (vencimiento.getMonth() === month && vencimiento.getFullYear() === year) {
              totalCuotas++;
              montoProyectado += cuota.monto;
              
              if (cuota.estado === 'pagado') {
                cuotasPagadas++;
                montoPagadas += cuota.monto;
                montoIngresado += cuota.monto;
              } else {
                cuotasPendientes++;
                montoPendientes += cuota.monto;
              }
            }
            
            // Cuotas adelantadas (pagadas este mes pero vencen después)
            if (cuota.fechaPago) {
              const fechaPago = new Date(cuota.fechaPago);
              if (fechaPago.getMonth() === month && fechaPago.getFullYear() === year && vencimiento > fechaPago) {
                cuotasAdelantadas++;
                montoAdelantadas += cuota.monto;
                montoIngresado += cuota.monto;
              }
            }
          }
        });
      }
    });

    const porcentajePagadas = totalCuotas > 0 ? (cuotasPagadas / totalCuotas) * 100 : 0;
    const porcentajePendientes = totalCuotas > 0 ? (cuotasPendientes / totalCuotas) * 100 : 0;
    const porcentajeIngresado = montoProyectado > 0 ? (montoIngresado / montoProyectado) * 100 : 0;

    return {
      totalCuotas,
      cuotasAdelantadas,
      montoAdelantadas,
      cuotasPagadas,
      montoPagadas,
      porcentajePagadas,
      cuotasPendientes,
      montoPendientes,
      porcentajePendientes,
      montoProyectado,
      montoIngresado,
      porcentajeIngresado
    };
  };

  const getMonthReport = (month: number, year: number) => {
    let totalClientes = 0;
    let clientesConCuotas = 0;
    let clientesAlContado = 0;
    let totalIngresos = 0;
    let ingresosPorIniciales = 0;
    let ingresosPorContado = 0;
    const detalleRegistros: RegistroDetalle[] = [];

    clients.forEach(client => {
      const fechaRegistro = new Date(client.fechaRegistro);
      
      if (fechaRegistro.getMonth() === month && fechaRegistro.getFullYear() === year) {
        totalClientes++;
        
        if (client.formaPago === 'cuotas') {
          clientesConCuotas++;
          if (client.inicial) {
            ingresosPorIniciales += client.inicial;
            totalIngresos += client.inicial;
          }
        } else {
          clientesAlContado++;
          
          // Calcular ingresos reales por contado basado en cuotas pagadas
          let ingresosContadoReal = 0;
          if (client.cuotas) {
            client.cuotas.forEach(cuota => {
              if (cuota.estado === 'pagado') {
                ingresosContadoReal += cuota.monto;
              }
            });
          }
          
          ingresosPorContado += ingresosContadoReal;
          totalIngresos += ingresosContadoReal;
        }

        detalleRegistros.push({
          fecha: client.fechaRegistro,
          nombre: `${client.nombre1} ${client.nombre2 || ''}`.trim(),
          dni: client.dni1,
          manzana: client.manzana,
          lote: client.lote,
          formaPago: client.formaPago,
          montoTotal: client.montoTotal,
          inicial: client.inicial || 0
        });
      }
    });

    return {
      totalClientes,
      clientesConCuotas,
      clientesAlContado,
      totalIngresos,
      ingresosPorIniciales,
      ingresosPorContado,
      detalleRegistros
    };
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Try to fetch and embed the logo across the top (edge-to-edge within margins)
    let titleY = 20;
    try {
      const logoData = await fetchImageAsDataURL('/logo.jpeg');
      if (logoData) {
        try {
          const imgProps = (doc as any).getImageProperties(logoData);
          const imgW = pageWidth - 20; // 10mm margin each side
          const imgH = (imgProps.height * imgW) / imgProps.width;
          doc.addImage(logoData, 'JPEG', 10, 6, imgW, imgH);
          titleY = 6 + imgH + 8;
        } catch (err) {
          console.error('Error adding logo to stats PDF:', err);
        }
      }
    } catch (err) {
      console.error('Logo fetch error', err);
    }

    try {
      if (showReport) {
        const report = getMonthReport(selectedMonth, selectedYear);

        // Encabezado
        doc.setFontSize(20);
        doc.text('REPORTE MENSUAL', pageWidth / 2, titleY, { align: 'center' });

        doc.setFontSize(14);
        doc.text(`${monthNames[selectedMonth]} ${selectedYear}`, pageWidth / 2, titleY + 15, { align: 'center' });

        // Resumen (incluye ingresos por iniciales y por contado)
        const summaryRows = [
          ['Total Clientes', report.totalClientes.toString()],
          ['Con Cuotas', report.clientesConCuotas.toString()],
          ['Al Contado', report.clientesAlContado.toString()],
          ['Total Ingresos', `S/ ${report.totalIngresos.toFixed(2)}`],
          ['Ingresos por Iniciales', `S/ ${report.ingresosPorIniciales.toFixed(2)}`],
          ['Ingresos por Contado', `S/ ${report.ingresosPorContado.toFixed(2)}`]
        ];

        const anyDoc = doc as jsPDF & { autoTable?: (options: any) => any };
        let afterSummaryY = titleY + 30;

        if (typeof anyDoc.autoTable === 'function') {
          anyDoc.autoTable({
            startY: titleY + 30,
            head: [['Concepto', 'Valor']],
            body: summaryRows,
            theme: 'plain',
            styles: { fontSize: 10 },
            columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right' } }
          });
          // @ts-ignore - lastAutoTable is injected by the plugin
          afterSummaryY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : titleY + 60;
        } else {
          // fallback: draw as text lines
          let y = titleY + 30;
          doc.setFontSize(10);
          summaryRows.forEach(([k, v]) => {
            doc.text(`${k}: ${v}`, 20, y);
            y += 8;
          });
          afterSummaryY = y + 6;
        }

        // Tabla de registros (detalle)
        if (report.detalleRegistros.length > 0) {
          // Build a robust tableData ensuring numeric fields are always strings
          const tableData = report.detalleRegistros.map((registro) => {
            const montoVal = Number((registro as any).montoTotal ?? (registro as any).monto ?? 0);
            const inicialVal = Number((registro as any).inicial ?? 0);
            return [
              new Date(registro.fecha).toLocaleDateString(),
              String(registro.nombre ?? ''),
              String(registro.dni ?? ''),
              String(registro.manzana ?? ''),
              String(registro.lote ?? ''),
              String(registro.formaPago ?? ''),
              `S/ ${montoVal.toFixed(2)}`,
              `S/ ${inicialVal.toFixed(2)}`
            ];
          });

          // Debug: print tableData and report to console with full content for diagnosis
          // eslint-disable-next-line no-console
          console.log('Reporte - tableData sample (detailed):\n' + JSON.stringify(tableData.slice(0,5), null, 2));
          // eslint-disable-next-line no-console
          console.log('Reporte full object sample registros (detailed):\n' + JSON.stringify(report.detalleRegistros.slice(0,5), null, 2));

          // Force manual table drawing to guarantee every cell is rendered exactly
          const forceManualTable = true;

          if (!forceManualTable && typeof anyDoc.autoTable === 'function') {
            anyDoc.autoTable({
              startY: afterSummaryY,
              head: [['Fecha', 'Nombre', 'DNI', 'Manzana', 'Lote', 'Forma\nPago', 'Monto\nTotal', 'Inicial']],
              body: tableData,
              theme: 'grid',
              styles: { fontSize: 8 },
              columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' } }
            });
          } else {
            // fallback: draw a proper table with blue header and borders
            const pageW = pageWidth;
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 10;
            const contentW = pageW - margin * 2;
            const startX = margin;
            let y = afterSummaryY;
            const baseRowH = 8; // minimal row height

            // Column widths adjusted: Fecha 12%, Nombre 30%, DNI 10%, Manzana 8%, Lote 6%, Forma Pago 12%, Monto 11%, Inicial 11%
            // This reduces 'Lote' to give more room for Monto/Inicial so numbers don't wrap or disappear.
            const colWidths = [contentW * 0.12, contentW * 0.30, contentW * 0.10, contentW * 0.08, contentW * 0.06, contentW * 0.12, contentW * 0.11, contentW * 0.11];
            const tableW = colWidths.reduce((s, w) => s + w, 0);

            const drawHeader = () => {
              // header background
              const headerH = Math.max(baseRowH, 12);
              doc.setFillColor(14, 165, 233);
              doc.rect(startX, y, tableW, headerH, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(9);
              // single-line headers
              doc.text('Fecha', startX + 3, y + 8);
              doc.text('Nombre', startX + colWidths[0] + 3, y + 8);
              doc.text('DNI', startX + colWidths[0] + colWidths[1] + 3, y + 8);
              doc.text('Manzana', startX + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 8);
              doc.text('Lote', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 3, y + 8);
              // two-line headers: Forma / Pago
              const formaX = startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 3;
              doc.text('Forma', formaX, y + 5);
              doc.text('Pago', formaX, y + headerH - 3);
              // two-line headers: Monto / Total
              const montoX = startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5] + 3;
              doc.text('Monto', montoX, y + 5);
              doc.text('Total', montoX, y + headerH - 3);
              // Inicial
              doc.text('Inicial', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5] + colWidths[6] + 3, y + 8);
              // header border
              doc.setDrawColor(0, 0, 0);
              doc.rect(startX, y, tableW, headerH, 'S');
              y += headerH;
              doc.setTextColor(0, 0, 0);
            };

            const drawRow = (row: string[]) => {
              // We will ensure numeric columns (indices 6 and 7) fit on one line and apply that font to entire row
              const maxAllowedLines = 3;
              let baseFont = 9;
              const minFont = 6;

              // Determine minimal font required so numeric cells fit in one line
              let numericMin = baseFont;
              for (const i of [6, 7]) {
                const text = row[i] ?? '';
                let candidate = baseFont;
                (doc as any).setFontSize(candidate);
                while (candidate > minFont && (doc as any).getTextWidth(String(text)) > (colWidths[i] - 6)) {
                  candidate -= 1;
                  (doc as any).setFontSize(candidate);
                }
                if (candidate < numericMin) numericMin = candidate;
              }

              // Start with numericMin for entire row to keep consistency
              let rowFont = numericMin;
              (doc as any).setFontSize(rowFont);

              // compute wrapped lines for each cell with current rowFont
              const cellLines: string[][] = [];
              let maxLines = 1;
              for (let i = 0; i < colWidths.length; i++) {
                const wrapWidth = colWidths[i] - 6;
                (doc as any).setFontSize(rowFont);
                const lines = (doc as any).splitTextToSize(String(row[i] ?? ''), wrapWidth);
                cellLines.push(lines);
                if (lines.length > maxLines) maxLines = lines.length;
              }

              // If too many lines, reduce font (up to minFont)
              while (maxLines > maxAllowedLines && rowFont > minFont) {
                rowFont -= 1;
                (doc as any).setFontSize(rowFont);
                maxLines = 1;
                for (let i = 0; i < colWidths.length; i++) {
                  const wrapWidth = colWidths[i] - 6;
                  const lines = (doc as any).splitTextToSize(String(row[i] ?? ''), wrapWidth);
                  cellLines[i] = lines;
                  if (lines.length > maxLines) maxLines = lines.length;
                }
              }

              const lineHeight = rowFont + 2;
              const rowHeight = Math.max(baseRowH, maxLines * lineHeight + 6);

              // page break if needed
              if (y + rowHeight > pageH - margin) {
                doc.addPage();
                y = margin;
                drawHeader();
              }

              let x = startX;
              for (let i = 0; i < colWidths.length; i++) {
                doc.rect(x, y, colWidths[i], rowHeight, 'S');
                const lines = cellLines[i] || [''];
                const textBlockH = lines.length * lineHeight;
                let textStartY = y + (rowHeight - textBlockH) / 2 + (rowFont - 1);

                (doc as any).setTextColor(0, 0, 0);
                (doc as any).setFontSize(rowFont);
                  if (i === 6 || i === 7) {
                    // right align numeric single-line values, ensure they fit and cap position
                    // Use the explicit numeric text from the original row to avoid split/wrap issues
                    const numericText = (row[i] ?? '').toString() || `S/ 0.00`;
                    // Force a known font family/style and size for numeric columns to guarantee rendering
                    try {
                      (doc as any).setFont('helvetica', 'normal');
                    } catch (e) {
                      // setFont may not be available in some builds; ignore errors
                    }
                    const numericFont = Math.max(rowFont, 7);
                    (doc as any).setFontSize(numericFont);
                    (doc as any).setTextColor(0, 0, 0);
                    const textW = (doc as any).getTextWidth(numericText);
                    let tx = x + colWidths[i] - 3 - textW;
                    if (tx < x + 3) tx = x + 3;
                    // Draw numeric text explicitly
                    doc.text(numericText, tx, textStartY);
                  } else {
                  (doc as any).setTextColor(0, 0, 0);
                  for (let li = 0; li < lines.length; li++) {
                    doc.text(lines[li], x + 3, textStartY + li * lineHeight);
                  }
                }

                x += colWidths[i];
              }
              y += rowHeight;
            };

            // draw header then rows (use tableData we constructed to ensure consistency)
            drawHeader();
            tableData.forEach(row => drawRow(row));
          }
        } else {
          // no registros
          doc.setFontSize(12);
          doc.text('No hay registros para el mes seleccionado.', 20, afterSummaryY + 6);
        }
      } else {
        const stats = getMonthStats(selectedMonth, selectedYear);

        // Encabezado
        doc.setFontSize(20);
        doc.text('ESTADÍSTICAS DE PAGOS', pageWidth / 2, titleY, { align: 'center' });

        doc.setFontSize(14);
        doc.text(`${monthNames[selectedMonth]} ${selectedYear}`, pageWidth / 2, titleY + 15, { align: 'center' });

        // Estadísticas: render as boxed cards (3 columns) to match UI layout
        const margin = 12;
        const gap = 8;
        const cols = 3;
        const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
        const cardH = 56;
        let cardX = margin;
        let cardY = titleY +  thirtyFive();

        // helper to keep spacing consistent
        function thirtyFive() {
          return 35;
        }

        const cards: Array<{ title: string; value: string; subtitle?: string } > = [
          { title: 'Total Clientes', value: String(report.totalClientes) },
          { title: 'Con Cuotas', value: String(report.clientesConCuotas) },
          { title: 'Al Contado', value: String(report.clientesAlContado) },
          { title: 'Total Ingresos', value: `S/ ${report.totalIngresos.toFixed(2)}` },
          { title: 'Ingresos por Iniciales', value: `S/ ${report.ingresosPorIniciales.toFixed(2)}` },
          { title: 'Ingresos por Contado', value: `S/ ${report.ingresosPorContado.toFixed(2)}` }
        ];

        // Draw rows of cards
        doc.setFont('helvetica', 'normal');
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cardW + gap);
          const y = cardY + row * (cardH + gap);

          // Card background
          doc.setFillColor(250, 250, 250);
          doc.rect(x, y, cardW, cardH, 'F');

          // Value (big)
          doc.setFontSize(16);
          doc.setTextColor(23, 23, 23);
          // center-left align value near top-left with padding
          doc.text(c.value, x + 8, y + 20);

          // Title (small)
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text(c.title, x + 8, y + 36);

          // Card border
          doc.setDrawColor(220, 220, 220);
          doc.rect(x, y, cardW, cardH, 'S');
        }
      }
    } catch (err) {
      console.error('Stats export error', err);
      toast.error('Ocurrió un error al generar el PDF. Revisa la consola.');
    } finally {
      try {
        doc.save(`${showReport ? 'reporte' : 'estadisticas'}_${monthNames[selectedMonth]}_${selectedYear}.pdf`);
        toast.success('PDF descargado exitosamente');
      } catch (err) {
        console.error('Error saving stats PDF', err);
        toast.error('No se pudo descargar el PDF. Revisa la consola.');
      }
    }
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const stats = getMonthStats(selectedMonth, selectedYear);
  const report = getMonthReport(selectedMonth, selectedYear);

  if (showReport) {
    return (
      <div className="space-y-6 w-full">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Reporte Mensual</span>
              <Button onClick={exportToPDF} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium">Seleccionar mes:</span>
              <Select value={`${selectedMonth}-${selectedYear}`} onValueChange={(value) => {
                const [month, year] = value.split('-');
                setSelectedMonth(parseInt(month));
                setSelectedYear(parseInt(year));
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((monthName, index) => (
                    <SelectItem key={index} value={`${index}-${selectedYear}`}>
                      {monthName} {selectedYear}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">
                Resumen de {monthNames[selectedMonth]} {selectedYear}
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{report.totalClientes}</div>
                    <p className="text-sm text-gray-600">Total Clientes</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{report.clientesConCuotas}</div>
                    <p className="text-sm text-gray-600">Con Cuotas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{report.clientesAlContado}</div>
                    <p className="text-sm text-gray-600">Al Contado</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">S/ {report.totalIngresos.toFixed(2)}</div>
                    <p className="text-sm text-gray-600">Total Ingresos</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-xl font-bold">S/ {report.ingresosPorIniciales.toFixed(2)}</div>
                    <p className="text-sm text-gray-600">Ingresos por Iniciales</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-xl font-bold">S/ {report.ingresosPorContado.toFixed(2)}</div>
                    <p className="text-sm text-gray-600">Ingresos por Contado</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Detalle de Registros</h3>
              <div className="w-full overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>DNI</TableHead>
                      <TableHead>Manzana</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Forma Pago</TableHead>
                      <TableHead>Monto Total</TableHead>
                      <TableHead>Inicial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.detalleRegistros.map((registro, index) => (
                      <TableRow key={index}>
                        <TableCell>{new Date(registro.fecha).toLocaleDateString()}</TableCell>
                        <TableCell>{registro.nombre}</TableCell>
                        <TableCell>{registro.dni}</TableCell>
                        <TableCell>{registro.manzana}</TableCell>
                        <TableCell>{registro.lote}</TableCell>
                        <TableCell>
                          <Badge variant={registro.formaPago === 'contado' ? 'default' : 'secondary'}>
                            {registro.formaPago}
                          </Badge>
                        </TableCell>
                        <TableCell>S/ {registro.montoTotal.toFixed(2)}</TableCell>
                        <TableCell>S/ {registro.inicial.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Estadísticas de Pagos</span>
            <Button onClick={exportToPDF} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium">Estadísticas de</span>
            <Select value={`${selectedMonth}-${selectedYear}`} onValueChange={(value) => {
              const [month, year] = value.split('-');
              setSelectedMonth(parseInt(month));
              setSelectedYear(parseInt(year));
            }}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((monthName, index) => (
                  <SelectItem key={index} value={`${index}-${selectedYear}`}>
                    {monthName} {selectedYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reordenado según el pedido: Total de Cuotas, Cuotas Pagadas, Cuotas Pendientes, Cuotas adelantadas, Monto Proyectado y Monto Ingresado */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-2xl font-bold">{stats.totalCuotas}</div>
                <p className="text-sm text-gray-600">Total de Cuotas</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-xl font-bold">
                  {stats.cuotasPagadas} ({stats.porcentajePagadas.toFixed(1)}%)
                </div>
                <div className="text-lg">S/ {stats.montoPagadas.toFixed(2)}</div>
                <p className="text-sm text-gray-600">Cuotas Pagadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-xl font-bold">
                  {stats.cuotasPendientes} ({stats.porcentajePendientes.toFixed(1)}%)
                </div>
                <div className="text-lg">S/ {stats.montoPendientes.toFixed(2)}</div>
                <p className="text-sm text-gray-600">Cuotas Pendientes</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-xl font-bold">{stats.cuotasAdelantadas}</div>
                <div className="text-lg">S/ {stats.montoAdelantadas.toFixed(2)}</div>
                <p className="text-sm text-gray-600">Cuotas Adelantadas</p>
                <p className="text-xs text-gray-500">Pagadas este mes, vencen después</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-xl font-bold">S/ {stats.montoProyectado.toFixed(2)}</div>
                <p className="text-sm text-gray-600">Monto Proyectado</p>
                <p className="text-xs text-gray-500">Lo que se esperaba recibir este mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="text-xl font-bold">
                  S/ {stats.montoIngresado.toFixed(2)} ({stats.porcentajeIngresado.toFixed(0)}% del proyectado)
                </div>
                <p className="text-sm text-gray-600">Monto Ingresado</p>
                <p className="text-xs text-gray-500">Incluye cuotas del mes + adelantadas</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}