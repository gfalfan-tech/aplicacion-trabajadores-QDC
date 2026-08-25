import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EMPRESA, formatFechaCorta, dibujarMembrete } from './pdfComun';

function formatearMinutos(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/**
 * Genera el PDF del "Informe RR.HH." para un rango de fechas, a partir del
 * objeto que devuelve generarInformeRRHH().
 */
export async function generarPdfInforme(informe) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const margen = 14;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Informe de RR.HH.', anchoPagina / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Período: ${formatFechaCorta(informe.desde)} al ${formatFechaCorta(informe.hasta)}`,
    anchoPagina / 2,
    y,
    { align: 'center' }
  );
  y += 5;
  doc.setFontSize(8);
  doc.text(EMPRESA.razonSocial, anchoPagina / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Permisos, atrasos, inasistencias, vacaciones y certificados', margen, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 92, 140] },
    head: [
      [
        'Trabajador',
        'Permisos (cant.)',
        'Permisos (min.)',
        'Permisos (días)',
        'Atraso (min.)',
        'Inasist. (días)',
        'Vacaciones (cant.)',
        'Vacaciones (días háb.)',
        'Certificados',
      ],
    ],
    body: informe.filasTrabajadores.map((f) => [
      f.trabajador.nombre_completo,
      f.permisosCantidad || '—',
      f.permisosMinutos ? formatearMinutos(f.permisosMinutos) : '—',
      f.permisosDiasCompletos || '—',
      f.atrasoMinutos ? formatearMinutos(f.atrasoMinutos) : '—',
      f.inasistenciaDias || '—',
      f.vacacionesCantidad || '—',
      f.vacacionesDiasHabiles || '—',
      f.certificadosCantidad || '—',
    ]),
  });

  if (informe.filasTrabajadores.some((f) => f.periodosAsistencia.length)) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Los atrasos/inasistencias corresponden a los períodos mensuales de asistencia subidos que se traslapan con el rango elegido (los minutos de atraso se guardan por mes completo, no día por día).',
      margen,
      doc.lastAutoTable.finalY + 5,
      { maxWidth: anchoPagina - margen * 2 }
    );
  }

  // --- Mural -----------------------------------------------------------
  if (informe.filasMural.length) {
    let yMural = doc.lastAutoTable.finalY + 14;
    if (yMural > 250) {
      doc.addPage();
      yMural = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Publicaciones del mural en el período', margen, yMural);

    autoTable(doc, {
      startY: yMural + 3,
      margin: { left: margen, right: margen },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 92, 140] },
      head: [['Fecha', 'Título', 'Reacciones', 'Comentarios']],
      body: informe.filasMural.map((p) => [
        new Date(p.publicado_en).toLocaleDateString('es-CL'),
        p.titulo,
        p.reacciones,
        p.comentarios,
      ]),
    });
  }

  // --- Ingresos / salidas / cumpleaños ----------------------------------
  let ySig = doc.lastAutoTable.finalY + 14;
  if (ySig > 240) {
    doc.addPage();
    ySig = 20;
  }

  if (informe.ingresos.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Ingresos de personal en el período', margen, ySig);
    autoTable(doc, {
      startY: ySig + 3,
      margin: { left: margen, right: margen },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 92, 140] },
      head: [['Trabajador', 'Cargo', 'Fecha de ingreso']],
      body: informe.ingresos.map((t) => [t.nombre_completo, t.cargo || '—', formatFechaCorta(t.fecha_ingreso)]),
    });
    ySig = doc.lastAutoTable.finalY + 14;
  }

  if (ySig > 240) {
    doc.addPage();
    ySig = 20;
  }

  if (informe.cumpleanosAniversarios.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Cumpleaños y aniversarios laborales del período', margen, ySig);
    autoTable(doc, {
      startY: ySig + 3,
      margin: { left: margen, right: margen },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [15, 92, 140] },
      head: [['Trabajador', 'Tipo', 'Fecha (día/mes)']],
      body: informe.cumpleanosAniversarios.map((e) => [e.trabajador.nombre_completo, e.tipo, e.mesDia]),
    });
    ySig = doc.lastAutoTable.finalY + 14;
  }

  if (informe.inactivosActuales.length) {
    if (ySig > 240) {
      doc.addPage();
      ySig = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Trabajadores actualmente inactivos', margen, ySig);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text(
      'No se guarda la fecha exacta en que quedaron inactivos, por lo que esta lista no está acotada al período elegido.',
      margen,
      ySig + 4,
      { maxWidth: anchoPagina - margen * 2 }
    );
    autoTable(doc, {
      startY: ySig + 8,
      margin: { left: margen, right: margen },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [120, 120, 120] },
      head: [['Trabajador', 'Cargo']],
      body: informe.inactivosActuales.map((t) => [t.nombre_completo, t.cargo || '—']),
    });
  }

  doc.save(`informe-rrhh_${informe.desde}_${informe.hasta}.pdf`);
}
