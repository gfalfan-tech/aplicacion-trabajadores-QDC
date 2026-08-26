import { jsPDF } from 'jspdf';
import { EMPRESA, dibujarMembrete } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';

function formatearFechaHora(fechaISO) {
  if (!fechaISO) return '—';
  return new Date(fechaISO).toLocaleString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Genera el PDF del "Recibo de solicitud de compra aprobado" — lo que el
 * administrador imprime y firma físicamente al entregar el dinero de caja
 * chica. `solicitud` ya viene con solicitante_nombre y aprobador_nombre.
 */
export async function generarPdfReciboCajaChica(solicitud) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 20;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('RECIBO DE SOLICITUD DE COMPRA — CAJA CHICA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(EMPRESA.razonSocial, anchoPagina / 2, y, { align: 'center' });
  y += 14;

  doc.setDrawColor(200);
  doc.setLineWidth(0.3);

  function fila(etiqueta, valor, alto = 9) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(etiqueta, margen, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(valor), margen + 55, y, { maxWidth: anchoPagina - margen - 55 - margen });
    y += alto;
  }

  fila('Fecha de aprobación:', formatearFechaHora(solicitud.fecha_resolucion));
  fila('Solicitante:', solicitud.solicitante_nombre);
  fila('Aprobado por:', solicitud.aprobador_nombre || '—');
  y += 2;
  doc.line(margen, y, anchoPagina - margen, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Monto aprobado:', margen, y);
  doc.setFontSize(16);
  doc.text(formatearCLP(solicitud.monto_solicitado), margen + 55, y);
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Artículo a comprar:', margen, y);
  doc.setFont('helvetica', 'normal');
  const lineasArticulo = doc.splitTextToSize(solicitud.articulo, anchoPagina - margen - 55 - margen);
  doc.text(lineasArticulo, margen + 55, y);
  y += Math.max(9, lineasArticulo.length * 5 + 2);

  doc.setFont('helvetica', 'bold');
  doc.text('Razón de la compra:', margen, y);
  doc.setFont('helvetica', 'normal');
  const lineasRazon = doc.splitTextToSize(solicitud.razon, anchoPagina - margen - 55 - margen);
  doc.text(lineasRazon, margen + 55, y);
  y += Math.max(9, lineasRazon.length * 5 + 2);

  y += 20;
  doc.line(margen, y, margen + 70, y);
  doc.line(anchoPagina - margen - 70, y, anchoPagina - margen, y);
  y += 5;
  doc.setFontSize(8);
  doc.text('Firma quien entrega', margen, y);
  doc.text('Firma quien recibe', anchoPagina - margen - 70, y);

  doc.save(`recibo-caja-chica-${solicitud.solicitante_nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
