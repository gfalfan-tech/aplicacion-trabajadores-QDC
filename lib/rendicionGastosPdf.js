import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  EMPRESA,
  formatFechaLarga,
  formatFechaCorta,
  dibujarMembrete,
  dibujarSelloEstado,
  dibujarFirmasRendicionGastos,
} from './pdfComun';
import {
  formatearMonto,
  etiquetaCategoria,
  etiquetaTipoDocumento,
  totalLineas,
  mensajeDiferencia,
} from './rendicionGastosLogica';

/**
 * Arma el PDF de "Rendición de Gastos" — disponible siempre como
 * previsualización (esté en borrador, pendiente o ya resuelta; el sello
 * y las firmas solo se dibujan una vez aprobada/rechazada). `rendicion`
 * debe venir ya con las relaciones cargadas (ver
 * lib/rendicionGastos.js#obtenerRendicion): trabajadores(nombre_completo,
 * rut), jefe_aprobador(nombre_completo) y rendicion_gastos_lineas(*).
 */
async function armarPdfRendicionGastos(rendicion) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margen = 22;
  const anchoPagina = 216;

  let y = await dibujarMembrete(doc, anchoPagina, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RENDICIÓN DE GASTOS', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(EMPRESA.razonSocial, anchoPagina / 2, y, { align: 'center' });
  y += 10;

  const trabajador = rendicion.trabajadores || {};
  const lineas = rendicion.rendicion_gastos_lineas || [];
  const totalGastado = totalLineas(lineas);
  const diferencia = Number(rendicion.total_entregado_qdc || 0) - totalGastado;

  const filasCabecera = [
    ['Trabajador', trabajador.nombre_completo || '—', 'RUT', trabajador.rut || '—'],
    ['Moneda', rendicion.moneda, 'Fecha', formatFechaLarga(new Date(rendicion.fecha_envio || rendicion.created_at))],
    [
      'Total entregado por QDC',
      formatearMonto(rendicion.total_entregado_qdc, rendicion.moneda),
      'Total gastado',
      formatearMonto(totalGastado, rendicion.moneda),
    ],
  ];
  if (rendicion.moneda === 'USD') {
    filasCabecera.push([
      'Tipo de cambio',
      rendicion.tipo_cambio ? `$${Number(rendicion.tipo_cambio).toLocaleString('es-CL')} CLP` : '—',
      'Diferencia',
      formatearMonto(diferencia, rendicion.moneda),
    ]);
    if (rendicion.tipo_cambio) {
      filasCabecera.push([
        'Total gastado en CLP',
        formatearMonto(totalGastado * Number(rendicion.tipo_cambio), 'CLP'),
        '',
        '',
      ]);
    }
  } else {
    filasCabecera.push(['Diferencia', formatearMonto(diferencia, rendicion.moneda), '', '']);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 9.5, cellPadding: 3 },
    theme: 'grid',
    body: filasCabecera,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', cellWidth: 32 },
      3: { cellWidth: 'auto' },
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...(diferencia >= 0 ? [21, 128, 61] : [185, 28, 28]));
  doc.text(mensajeDiferencia(diferencia, rendicion.moneda), margen, y);
  doc.setTextColor(0);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 92, 140] },
    head: [['Fecha', 'Categoría', 'Documento', 'Descripción', 'Monto']],
    body: lineas.length
      ? lineas.map((l) => [
          formatFechaCorta(l.fecha_gasto),
          etiquetaCategoria(l.categoria),
          etiquetaTipoDocumento(l.tipo_documento),
          l.descripcion || '—',
          formatearMonto(l.monto, rendicion.moneda),
        ])
      : [['—', '—', '—', 'Sin líneas de gasto cargadas', '—']],
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 28 },
      2: { cellWidth: 22 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 26, halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 14;

  if (rendicion.estado === 'aprobada' || rendicion.estado === 'rechazada') {
    const aprobada = rendicion.estado === 'aprobada';
    const ySelloFin = dibujarSelloEstado(doc, rendicion.estado, anchoPagina, y, undefined, aprobada);
    if (aprobada) {
      await dibujarFirmasRendicionGastos(doc, anchoPagina, ySelloFin, {
        jefeNombre: rendicion.jefe_aprobador?.nombre_completo,
        trabajadorNombre: trabajador.nombre_completo,
      });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(150);
    let mensaje = 'Borrador — todavía no se ha enviado para revisión.';
    if (rendicion.estado === 'pendiente') mensaje = 'Rendición pendiente de revisión por la jefatura.';
    if (rendicion.estado === 'aprobada_jefe') mensaje = 'Aprobada por el jefe directo. Pendiente de la firma de Finanzas.';
    doc.text(mensaje, margen, y);
    doc.setTextColor(0);
  }

  return doc;
}

function nombreArchivo(rendicion) {
  const rut = (rendicion.trabajadores?.rut || '').replace(/\./g, '').replace(/-/g, '');
  const fecha = (rendicion.fecha_envio || rendicion.created_at || '').slice(0, 10);
  return `rendicion_gastos_${rut || 'borrador'}_${fecha}.pdf`;
}

export async function verPdfRendicionGastos(rendicion) {
  const doc = await armarPdfRendicionGastos(rendicion);
  window.open(doc.output('bloburl'), '_blank');
}

export async function descargarPdfRendicionGastos(rendicion) {
  const doc = await armarPdfRendicionGastos(rendicion);
  doc.save(nombreArchivo(rendicion));
}
