import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EMPRESA, formatFechaLarga, formatFechaCorta, dibujarMembrete } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';

const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente de aprobación',
  rechazada: 'Rechazada',
  aprobada: 'Aprobada — pendiente de entrega',
  entregada: 'Entregada — pendiente de rendir',
  rendicion_ingresada: 'Rendición por confirmar',
  rendida: 'Rendida',
};

const ETIQUETA_TIPO_DOC = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };

function docsDeSolicitud(solicitud) {
  const docs = (solicitud.comprobantes || []).map(
    (c) => `${ETIQUETA_TIPO_DOC[c.tipo] || c.tipo}${c.numero_documento ? ` N°${c.numero_documento}` : ''}`
  );
  return docs.length ? docs.join(', ') : '—';
}

/**
 * Genera el PDF "estilo cartola" de Caja Chica — pensado para llevárselo a
 * Gerencia como respaldo al pedir un nuevo monto: saldo inicial, cada
 * salida (quién compró, para qué, con qué documento, cuánto), y el saldo
 * que debería quedar. `reporte` es el mismo objeto que devuelve
 * /api/caja-chica/periodo?reporte=1 (obtenerReporteCajaChica()).
 */
export async function generarPdfInformeCajaChica(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 14;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INFORME DE CAJA CHICA', anchoPagina / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const periodo = reporte.periodo;
  const desdeTexto = periodo?.fecha_inicio ? formatFechaCorta(periodo.fecha_inicio.slice(0, 10)) : '—';
  doc.text(`Período desde el ${desdeTexto} hasta la fecha de este informe`, anchoPagina / 2, y, {
    align: 'center',
  });
  y += 5;
  doc.setFontSize(8);
  doc.text(`Emitido: ${formatFechaLarga(new Date())}`, anchoPagina / 2, y, { align: 'center' });
  y += 10;

  if (!periodo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Todavía no hay un fondo de caja chica abierto.', margen, y);
    doc.save('informe_caja_chica.pdf');
    return;
  }

  // --- Resumen (estilo cartola: saldo inicial / salidas / saldo final) ---
  const totales = reporte.totales || {};
  const totalSalidas = (reporte.solicitudes || [])
    .filter((s) => ['entregada', 'rendicion_ingresada', 'rendida'].includes(s.estado))
    .reduce((acc, s) => acc + Number(s.monto_rendido ?? s.monto_solicitado), 0);

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 9, cellPadding: 2.5 },
    theme: 'grid',
    body: [
      ['Saldo inicial del período', formatearCLP(periodo.monto_inicial)],
      ['Total salidas (entregado / rendido)', `- ${formatearCLP(totalSalidas)}`],
      ['Saldo disponible actual', formatearCLP(totales.disponible)],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 }, 1: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 4;

  if (totales.enProceso > 0 || totales.vueltoPendiente > 0 || totales.deudorPendiente > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen },
      styles: { fontSize: 8, cellPadding: 2 },
      theme: 'plain',
      body: [
        ['En proceso de compra (aprobado/entregado, aún no rendido)', formatearCLP(totales.enProceso)],
        totales.vueltoPendiente > 0
          ? ['Vuelto pendiente por recibir de solicitantes', formatearCLP(totales.vueltoPendiente)]
          : null,
        totales.deudorPendiente > 0
          ? ['Saldo deudor pendiente por entregar a solicitantes', formatearCLP(totales.deudorPendiente)]
          : null,
      ].filter(Boolean),
      columnStyles: { 0: { cellWidth: 140, textColor: [100, 100, 100] }, 1: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 6;
  } else {
    y += 4;
  }

  // --- Estado de cuenta detallado ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Estado de cuenta detallado', margen, y);
  y += 2;

  const filas = (reporte.solicitudes || []).map((s) => [
    s.created_at ? formatFechaCorta(s.created_at.slice(0, 10)) : '—',
    s.solicitante_nombre || '—',
    `${s.articulo || '—'}${s.razon ? ` (${s.razon})` : ''}`,
    s.aprobador_nombre || '—',
    docsDeSolicitud(s),
    formatearCLP(s.monto_rendido ?? s.monto_solicitado),
    ETIQUETA_ESTADO[s.estado] || s.estado,
  ]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen, right: margen },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 92, 140] },
    head: [['Fecha', 'Compró', 'Para qué (artículo / razón)', 'Aprobó', 'Documento', 'Monto', 'Estado']],
    body: filas.length ? filas : [['—', 'Sin movimientos en este período', '', '', '', '', '']],
    columnStyles: {
      5: { halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 20;

  // --- Firmas ---
  if (y > 250) {
    doc.addPage();
    y = 30;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.line(margen, y, margen + 70, y);
  doc.line(anchoPagina - margen - 70, y, anchoPagina - margen, y);
  y += 5;
  doc.text('RR.HH. / Administración', margen, y);
  doc.text('Gerencia', anchoPagina - margen - 70, y);

  const nombreArchivo = `informe_caja_chica_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nombreArchivo);
}
