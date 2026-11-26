import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFechaLarga, dibujarMembrete } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';

const AZUL = [15, 92, 140];
const AZUL_OSCURO = [21, 58, 91];
const GRIS_FONDO = [241, 245, 249];
const GRIS_TEXTO = [100, 116, 139];
const LINEA = [51, 65, 85]; // gris oscuro para que las cuadrículas se vean al imprimir
const GROSOR = 0.3;

const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };

function fechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Santiago',
  });
}

function folioTexto(folio) {
  return String(folio || 0).padStart(4, '0');
}

/**
 * PDF de una o dos hojas con el resumen de la caja chica (folio abierto):
 * saldo inicial, tabla de gastos con fecha de solicitud y de rendición,
 * totales y firmas. Es la copia física que acompaña al dinero.
 * `reporte` es lo que devuelve obtenerReporteCajaChica().
 */
export async function generarPdfResumenCajaChica(reporte) {
  const periodo = reporte.periodo;
  if (!periodo) throw new Error('No hay un fondo de caja chica abierto.');

  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' });
  const anchoPagina = 279;
  const altoPagina = 216;
  const margen = 14;
  const folio = folioTexto(periodo.folio);

  let y = await dibujarMembrete(doc, anchoPagina, 10, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('RENDICIÓN DE CAJA CHICA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text(`FOLIO ${folio}`, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 5;

  // Ficha del folio
  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    theme: 'grid',
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: LINEA,
      lineWidth: GROSOR,
      halign: 'center',
    },
    head: [['FOLIO', 'FECHA DE APERTURA', 'SALDO INICIAL', 'FECHA DE IMPRESIÓN']],
    headStyles: { fillColor: AZUL_OSCURO, textColor: 255, fontSize: 7, fontStyle: 'bold' },
    tableWidth: anchoPagina - margen * 2,
    body: [[folio, fechaCorta(periodo.fecha_inicio), formatearCLP(periodo.monto_inicial), fechaCorta(new Date().toISOString())]],
    bodyStyles: { fontStyle: 'bold' },
  });
  y = doc.lastAutoTable.finalY + 7;

  // Detalle de gastos
  const solicitudes = (reporte.solicitudes || []).filter((s) => s.estado !== 'rechazada');
  const rendidas = solicitudes.filter((s) => s.estado === 'rendida');
  const totalRendido = rendidas.reduce((acc, s) => acc + Number(s.monto_rendido || 0), 0);
  const enCurso = solicitudes.filter((s) => s.estado !== 'rendida');
  const totalEnCurso = enCurso.reduce((acc, s) => acc + Number(s.monto_solicitado || 0), 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('Detalle de gastos', margen, y);
  doc.setTextColor(0, 0, 0);

  // Una fila por documento de respaldo; los datos de la solicitud
  // (N°, fechas, detalle, quién) se combinan en una sola celda.
  const cuerpo = [];
  solicitudes.forEach((s, i) => {
    const fondo = i % 2 ? [248, 250, 252] : [255, 255, 255];
    const docs = s.estado === 'rendida' ? s.comprobantes || [] : [];
    const filasDoc = docs.length || 1;
    const celda = (content, extra = {}) => ({ content, rowSpan: filasDoc, styles: { fillColor: fondo, ...extra } });
    const comunes = [
      celda(String(i + 1), { halign: 'center' }),
      celda(fechaCorta(s.created_at), { halign: 'center' }),
      celda(s.estado === 'rendida' ? fechaCorta(s.fecha_rendicion) : '—', { halign: 'center' }),
      celda(s.articulo || '—'),
      celda(`${s.solicitante_nombre || '—'}\nAut.: ${s.aprobador_nombre || '—'}`),
    ];
    if (!docs.length) {
      cuerpo.push([
        ...comunes,
        { content: s.estado === 'rendida' ? 'Sin comprobante' : 'En curso, sin rendir', styles: { fillColor: fondo } },
        { content: '—', styles: { fillColor: fondo, halign: 'center' } },
        { content: '—', styles: { fillColor: fondo } },
        { content: formatearCLP(s.monto_solicitado), styles: { fillColor: fondo, halign: 'right', fontStyle: 'bold' } },
      ]);
      return;
    }
    docs.forEach((c, j) => {
      cuerpo.push([
        ...(j === 0 ? comunes : []),
        {
          content: `${ETIQUETA_TIPO[c.tipo] || c.tipo} N° ${c.numero_documento || 'S/N'}`,
          styles: { fillColor: fondo, fontStyle: 'bold' },
        },
        { content: c.tipo === 'factura' ? c.rut_proveedor || '—' : '—', styles: { fillColor: fondo, halign: 'center' } },
        { content: c.tipo === 'factura' ? c.proveedor || '—' : '—', styles: { fillColor: fondo } },
        { content: formatearCLP(c.monto), styles: { fillColor: fondo, halign: 'right', fontStyle: 'bold' } },
      ]);
    });
  });

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen, right: margen, bottom: 20 },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.4, lineColor: LINEA, lineWidth: GROSOR, valign: 'middle' },
    headStyles: { fillColor: AZUL_OSCURO, textColor: 255, fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: 'bold', fontSize: 9 },
    head: [['N°', 'Fecha solicitud', 'Fecha rendición', 'Detalle', 'Solicitó / Autorizó', 'Documento', 'RUT proveedor', 'Proveedor', 'Monto']],
    body: cuerpo.length ? cuerpo : [['', '', '', 'Sin gastos en este folio', '', '', '', '', '']],
    foot: [[{ content: 'TOTAL RENDIDO', colSpan: 8, styles: { halign: 'right' } }, { content: formatearCLP(totalRendido), styles: { halign: 'right' } }]],
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: 23 },
      2: { cellWidth: 23 },
      4: { cellWidth: 38 },
      5: { cellWidth: 32 },
      6: { cellWidth: 26 },
      7: { cellWidth: 40 },
      8: { cellWidth: 24 },
    },
    showFoot: 'lastPage',
  });
  y = doc.lastAutoTable.finalY + 8;

  // Cuadratura
  const saldoTeorico = Number(periodo.monto_inicial) - totalRendido;
  const filas = [
    ['Saldo inicial del folio', formatearCLP(periodo.monto_inicial)],
    ['(−) Total rendido', formatearCLP(totalRendido)],
    ['Saldo que debe haber en caja', formatearCLP(saldoTeorico)],
  ];
  if (enCurso.length) {
    filas.push([`Solicitudes en curso (${enCurso.length}), aún sin rendir`, formatearCLP(totalEnCurso)]);
  }
  if (periodo.efectivo_contado != null) {
    filas.push(['Efectivo contado', formatearCLP(periodo.efectivo_contado)]);
    filas.push(['Diferencia', formatearCLP(Number(periodo.efectivo_contado) - saldoTeorico)]);
  }
  if (periodo.monto_reintegro != null) {
    filas.push(['Monto a reintegrar', formatearCLP(periodo.monto_reintegro)]);
  }

  if (y > altoPagina - 24 - filas.length * 7 - 40) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('Cuadratura', margen, y);
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen },
    tableWidth: 100,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.4, lineColor: LINEA, lineWidth: GROSOR },
    body: filas,
    columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 32, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.row.index === 2 || d.row.index === filas.length - 1) {
        d.cell.styles.fillColor = [226, 232, 240];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 22;

  // Firmas
  if (y > altoPagina - 30) {
    doc.addPage();
    y = 40;
  }
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  const anchoFirma = 70;
  doc.line(margen + 6, y, margen + 6 + anchoFirma, y);
  doc.line(anchoPagina - margen - 6 - anchoFirma, y, anchoPagina - margen - 6, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text('Responsable de caja chica', margen + 6 + anchoFirma / 2, y + 4.5, { align: 'center' });
  doc.text('Recibe / V°B° Administración', anchoPagina - margen - 6 - anchoFirma / 2, y + 4.5, { align: 'center' });

  // Pie con numeración
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Caja chica — Folio ${folio} · Emitido el ${formatFechaLarga(new Date())}`, margen, altoPagina - 8);
    doc.text(`Página ${i} de ${n}`, anchoPagina - margen, altoPagina - 8, { align: 'right' });
  }

  doc.save(`rendicion_caja_chica_folio_${folio}.pdf`);
}
