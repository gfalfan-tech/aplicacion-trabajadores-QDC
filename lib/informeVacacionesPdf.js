import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EMPRESA, formatFechaLarga, dibujarMembrete } from './pdfComun';

function formatDias(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Genera el PDF del "Informe de vacaciones": una tabla con el saldo de
 * cada trabajador activo al día de hoy, a partir de la lista que arma
 * app/rrhh/informes/vacaciones/page.js (mismos campos: nombre_completo,
 * rut, pendientePeriodoAnterior, periodoActual, diasProgresivos,
 * disponibles).
 */
export async function generarPdfInformeVacaciones(filas) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 14;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Informe de vacaciones', anchoPagina / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Saldo al ${formatFechaLarga(new Date())}`, anchoPagina / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8);
  doc.text(EMPRESA.razonSocial, anchoPagina / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text(
    '"Pendientes del período anterior" marca hasta un período completo (15 días hábiles + progresivos ' +
      'vigentes) que ya debería haberse tomado según la fecha de ingreso. "Período actual" es el resto del ' +
      'saldo, del período que está corriendo — los dos números suman "Vacaciones disponibles".',
    margen,
    y,
    { maxWidth: anchoPagina - margen * 2 }
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 92, 140] },
    head: [
      [
        'Trabajador',
        'RUT',
        'Pendientes período anterior',
        'Período actual',
        'Días progresivos',
        'Vacaciones disponibles',
      ],
    ],
    body: filas.map((f) => [
      f.nombre_completo,
      f.rut || '—',
      formatDias(f.pendientePeriodoAnterior),
      formatDias(f.periodoActual),
      formatDias(f.diasProgresivos),
      formatDias(f.disponibles),
    ]),
  });

  doc.save(`informe-vacaciones_${new Date().toISOString().slice(0, 10)}.pdf`);
}
