import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EMPRESA, formatFechaLarga, dibujarMembrete, dibujarTimbre } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';

const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };

/**
 * Genera el PDF "Desglose de Gasto" — el detalle de cómo se gastó una
 * solicitud de caja chica ya entregada: cada comprobante cargado al
 * rendir, con su tipo, N° de documento, descripción y monto, más el
 * total rendido y la diferencia (vuelto o saldo a favor). `solicitud`
 * ya viene enriquecida por /api/caja-chica/estado (trae comprobantes,
 * solicitante_nombre, etc.).
 */
async function armarPdfDesgloseCajaChica(solicitud) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 22;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('DESGLOSE DE GASTO — CAJA CHICA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(EMPRESA.razonSocial, anchoPagina / 2, y, { align: 'center' });
  y += 12;

  const comprobantes = solicitud.comprobantes || [];
  const totalRendido = comprobantes.reduce((acc, c) => acc + Number(c.monto || 0), 0);
  const diferencia = Number(solicitud.monto_solicitado) - totalRendido;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 10, cellPadding: 3 },
    theme: 'grid',
    body: [
      ['Solicitante', solicitud.solicitante_nombre || '—', 'Monto entregado', formatearCLP(solicitud.monto_solicitado)],
      ['Artículo', solicitud.articulo || '—', 'Fecha', formatFechaLarga(new Date(solicitud.created_at))],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 32 },
      3: { cellWidth: 'auto' },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 92, 140] },
    head: [['Tipo', 'N° documento', 'Descripción', 'Monto']],
    body: comprobantes.length
      ? comprobantes.map((c) => [
          ETIQUETA_TIPO[c.tipo] || c.tipo,
          c.numero_documento || '—',
          c.descripcion || '—',
          formatearCLP(c.monto),
        ])
      : [['—', '—', 'Sin comprobantes cargados todavía', '—']],
    columnStyles: { 3: { halign: 'right', cellWidth: 30 } },
  });
  y = doc.lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 9, cellPadding: 2.5 },
    theme: 'plain',
    body: [
      ['Total rendido', formatearCLP(totalRendido)],
      diferencia > 0
        ? ['Vuelto a devolver a la caja', formatearCLP(diferencia)]
        : diferencia < 0
        ? ['Saldo a favor del solicitante', formatearCLP(-diferencia)]
        : ['Cuadra exacto con el monto entregado', ''],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 24;

  if (y > 250) {
    doc.addPage();
    y = 30;
  }

  const yLinea = y;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margen, yLinea, margen + 70, yLinea);
  doc.line(anchoPagina - margen - 70, yLinea, anchoPagina - margen, yLinea);

  // El timbre de Finanzas solo se dibuja cuando la solicitud ya quedó
  // "rendida" (cerrada del todo, con el vuelto o reembolso confirmado) —
  // el mismo criterio que usamos para la carpeta Respaldos.
  if (solicitud.estado === 'rendida') {
    await dibujarTimbre(doc, 'finanzas', anchoPagina - margen - 35, yLinea - 10, 24);
  }

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Rendido por', margen, y);
  doc.text('Revisado por Finanzas', anchoPagina - margen - 70, y);

  return doc;
}

function nombreArchivo(solicitud) {
  return `desglose-gasto-${(solicitud.solicitante_nombre || 'trabajador').replace(/\s+/g, '-').toLowerCase()}.pdf`;
}

export async function verPdfDesgloseCajaChica(solicitud) {
  const doc = await armarPdfDesgloseCajaChica(solicitud);
  window.open(doc.output('bloburl'), '_blank');
}

export async function descargarPdfDesgloseCajaChica(solicitud) {
  const doc = await armarPdfDesgloseCajaChica(solicitud);
  doc.save(nombreArchivo(solicitud));
}
