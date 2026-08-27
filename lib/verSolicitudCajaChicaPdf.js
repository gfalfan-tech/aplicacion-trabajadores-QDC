import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EMPRESA, formatFechaLarga, dibujarMembrete } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';

/**
 * Genera el PDF "Solicitud de Compra" — la vista formal que ve quien debe
 * aprobar o rechazar, ANTES de decidir. Sigue el mismo formato que usaba
 * QDC en papel (solicitante / fecha / área / monto + detalle + firmas),
 * adaptado a los datos que junta la app. No reemplaza el botón de
 * Aprobar/Rechazar — es solo la vista/comprobante de lo que se está
 * pidiendo. `solicitud` ya viene enriquecida por /api/caja-chica/estado
 * (trae solicitante_nombre, solicitante_cargo, solicitante_area).
 */
async function armarPdfSolicitudCajaChica(solicitud) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 22;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SOLICITUD DE COMPRA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Caja chica — ${EMPRESA.razonSocial}`, anchoPagina / 2, y, { align: 'center' });
  y += 12;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 10, cellPadding: 3 },
    theme: 'grid',
    body: [
      ['Solicitante', solicitud.solicitante_nombre || '—', 'Fecha', formatFechaLarga(new Date(solicitud.created_at))],
      [
        'Área / Cargo',
        [solicitud.solicitante_area, solicitud.solicitante_cargo].filter(Boolean).join(' — ') || '—',
        'Monto',
        formatearCLP(solicitud.monto_solicitado),
      ],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 25 },
      3: { cellWidth: 'auto' },
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 92, 140] },
    head: [['DESCRIPCIÓN', 'RAZÓN DE LA COMPRA', 'MONTO']],
    body: [[solicitud.articulo || '—', solicitud.razon || '—', formatearCLP(solicitud.monto_solicitado)]],
    columnStyles: { 2: { halign: 'right', cellWidth: 35 } },
  });
  y = doc.lastAutoTable.finalY + 24;

  if (y > 250) {
    doc.addPage();
    y = 30;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margen, y, margen + 70, y);
  doc.line(anchoPagina - margen - 70, y, anchoPagina - margen, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('FIRMA SOLICITANTE', margen, y);
  doc.text('FIRMA APROBADOR', anchoPagina - margen - 70, y);

  return doc;
}

function nombreArchivo(solicitud) {
  return `solicitud-compra-${(solicitud.solicitante_nombre || 'trabajador').replace(/\s+/g, '-').toLowerCase()}.pdf`;
}

export async function verPdfSolicitudCajaChica(solicitud) {
  const doc = await armarPdfSolicitudCajaChica(solicitud);
  window.open(doc.output('bloburl'), '_blank');
}

export async function descargarPdfSolicitudCajaChica(solicitud) {
  const doc = await armarPdfSolicitudCajaChica(solicitud);
  doc.save(nombreArchivo(solicitud));
}
