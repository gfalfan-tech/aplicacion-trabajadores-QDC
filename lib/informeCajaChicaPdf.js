import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFechaLarga, dibujarMembrete } from './pdfComun';
import { formatearCLP } from './cajaChicaLogica';
import { cargarImagenComprobante } from './cajaChica';

const AZUL = [15, 92, 140];
const AZUL_OSCURO = [21, 58, 91];
const GRIS_FONDO = [241, 245, 249];
const GRIS_TEXTO = [100, 116, 139];

const ETIQUETA_TIPO_DOC = { factura: 'Factura', boleta: 'Boleta', vale_por: 'Vale por' };
const PLURAL_TIPO_DOC = { factura: 'Facturas', boleta: 'Boletas', vale_por: 'Vales por' };

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

function etiquetaDoc(c) {
  return `${ETIQUETA_TIPO_DOC[c.tipo] || c.tipo} N°${c.numero_documento || 'S/N'}`;
}

/**
 * Genera el PDF "Solicitud de reintegro de Caja Chica" de un folio (período):
 * todo el movimiento de la caja en un solo documento — ficha del folio,
 * detalle de cada compra (fecha, quién, quién autorizó, para qué, monto,
 * documento de respaldo), resúmenes, cuadratura contra el efectivo contado,
 * monto a reintegrar y firmas — y, al final, las fotos de los comprobantes
 * numeradas para poder cruzarlas con el detalle.
 *
 * `reporte` es lo que devuelve /api/caja-chica/periodo?reporte=1
 * (obtenerReporteCajaChica / obtenerReportePeriodo). Se omiten las
 * solicitudes rechazadas.
 */
export async function generarPdfInformeCajaChica(reporte) {
  const periodo = reporte.periodo;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const anchoPagina = 216;
  const altoPagina = 279;
  const margen = 14;
  const anchoUtil = anchoPagina - margen * 2;
  const folio = folioTexto(periodo?.folio);

  let y = await dibujarMembrete(doc, anchoPagina, 10, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('SOLICITUD DE REINTEGRO — CAJA CHICA', anchoPagina / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text(`FOLIO ${folio}`, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 6;

  if (!periodo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Todavía no hay un fondo de caja chica abierto.', margen, y + 6);
    doc.save('solicitud_reintegro_caja_chica.pdf');
    return;
  }

  // Solo lo que realmente se gastó: solicitudes rendidas, en orden.
  const rendidas = (reporte.solicitudes || []).filter((s) => s.estado === 'rendida');
  let nDoc = 0;
  const detalle = rendidas.map((s, i) => ({
    n: i + 1,
    s,
    docs: (s.comprobantes || []).map((c) => ({ ...c, nDoc: ++nDoc, solicitudN: i + 1, s })),
  }));
  const todosLosDocs = detalle.flatMap((d) => d.docs);
  const totalRendido = rendidas.reduce((acc, s) => acc + Number(s.monto_rendido || 0), 0);
  const saldoTeorico = Number(periodo.monto_inicial) - totalRendido;
  const efectivoContado = periodo.efectivo_contado != null ? Number(periodo.efectivo_contado) : null;
  const montoReintegro = periodo.monto_reintegro != null ? Number(periodo.monto_reintegro) : null;
  const diferencia = efectivoContado != null ? efectivoContado - saldoTeorico : null;

  // ---- Ficha del folio ----
  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 }, fillColor: GRIS_FONDO },
    head: [['FOLIO', 'APERTURA', 'RENDICIÓN APROBADA', 'CÓDIGO DE VERIFICACIÓN']],
    headStyles: { fontSize: 6.5, textColor: GRIS_TEXTO, fontStyle: 'normal' },
    body: [
      [
        folio,
        `${fechaCorta(periodo.fecha_inicio)}\n${periodo.abierto_por_nombre || ''}`,
        periodo.rendicion_aprobada_at
          ? `${fechaCorta(periodo.rendicion_aprobada_at)}\n${periodo.rendicion_aprobada_por_nombre || ''}`
          : 'Pendiente',
        periodo.codigo_verificacion || '—',
      ],
    ],
    bodyStyles: { fontStyle: 'bold' },
  });
  y = doc.lastAutoTable.finalY + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS_TEXTO);
  doc.text(
    `${rendidas.length} solicitud(es) rendida(s) · ${todosLosDocs.length} documento(s) de respaldo adjuntos al final · Emitido el ${formatFechaLarga(new Date())}`,
    margen,
    y + 3
  );
  doc.setTextColor(0, 0, 0);
  y += 9;

  // ---- Detalle de movimientos ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('Detalle de movimientos', margen, y);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen, right: margen },
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.1, valign: 'top' },
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7 },
    footStyles: { fillColor: GRIS_FONDO, textColor: 0, fontStyle: 'bold', fontSize: 8 },
    head: [['N°', 'Fecha', 'Solicitó', 'Autorizó', 'Para qué', 'Respaldo (N° de adjunto)', 'Monto rendido']],
    body: detalle.length
      ? detalle.map((d) => [
          d.n,
          fechaCorta(d.s.created_at),
          `${d.s.solicitante_nombre || '—'}${d.s.solicitante_area ? `\n${d.s.solicitante_area}` : ''}`,
          d.s.aprobador_nombre || '—',
          `${d.s.articulo || '—'}${d.s.razon ? `\n${d.s.razon}` : ''}`,
          d.docs.length
            ? d.docs.map((c) => `Doc ${c.nDoc}: ${etiquetaDoc(c)} · ${formatearCLP(c.monto)}`).join('\n')
            : 'Sin comprobantes',
          formatearCLP(d.s.monto_rendido),
        ])
      : [['—', '', 'Sin movimientos en este folio', '', '', '', '']],
    foot: [['', '', '', '', '', 'TOTAL RENDIDO', formatearCLP(totalRendido)]],
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 19 },
      2: { cellWidth: 30 },
      3: { cellWidth: 26 },
      4: { cellWidth: 38 },
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- Resúmenes (por tipo, persona, área) ----
  const porTipo = new Map();
  const porPersona = new Map();
  const porArea = new Map();
  detalle.forEach((d) => {
    d.docs.forEach((c) => {
      const t = porTipo.get(c.tipo) || { n: 0, monto: 0 };
      t.n += 1;
      t.monto += Number(c.monto);
      porTipo.set(c.tipo, t);
    });
    const nombre = d.s.solicitante_nombre || '—';
    porPersona.set(nombre, (porPersona.get(nombre) || 0) + Number(d.s.monto_rendido || 0));
    const area = d.s.solicitante_area || 'Sin área';
    porArea.set(area, (porArea.get(area) || 0) + Number(d.s.monto_rendido || 0));
  });

  if (y > altoPagina - 95) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('Resumen', margen, y);
  doc.setTextColor(0, 0, 0);
  y += 2;

  const gap = 4;
  const anchoCol = (anchoUtil - gap * 2) / 3;
  const tablaResumen = (titulo, filas, xIzq) =>
    autoTable(doc, {
      startY: y,
      margin: { left: xIzq },
      tableWidth: anchoCol,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.4 },
      headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7 },
      alternateRowStyles: { fillColor: GRIS_FONDO },
      head: [[titulo, '']],
      body: filas.length ? filas : [['—', '']],
      columnStyles: { 1: { halign: 'right' } },
    });
  tablaResumen(
    'Por tipo',
    Array.from(porTipo.entries()).map(([t, v]) => [`${PLURAL_TIPO_DOC[t] || t} (${v.n})`, formatearCLP(v.monto)]),
    margen
  );
  const f1 = doc.lastAutoTable.finalY;
  tablaResumen(
    'Por persona',
    Array.from(porPersona.entries()).map(([n, m]) => [n, formatearCLP(m)]),
    margen + anchoCol + gap
  );
  const f2 = doc.lastAutoTable.finalY;
  tablaResumen(
    'Por área',
    Array.from(porArea.entries()).map(([n, m]) => [n, formatearCLP(m)]),
    margen + (anchoCol + gap) * 2
  );
  y = Math.max(f1, f2, doc.lastAutoTable.finalY) + 7;

  // ---- Cuadratura ----
  if (y > altoPagina - 110) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...AZUL_OSCURO);
  doc.text('Cuadratura de caja', margen, y);
  doc.setTextColor(0, 0, 0);

  const filasCuadratura = [
    [`Fondo inicial de la caja (folio ${folio})`, formatearCLP(periodo.monto_inicial)],
    ['(-) Total rendido en el período', `- ${formatearCLP(totalRendido)}`],
    ['= Saldo teórico que debe haber en caja', formatearCLP(saldoTeorico)],
  ];
  if (efectivoContado != null) {
    filasCuadratura.push(['Efectivo contado en caja al cierre', formatearCLP(efectivoContado)]);
    filasCuadratura.push([
      'Diferencia (contado - teórico)',
      diferencia === 0 ? `${formatearCLP(0)}   — cuadra` : `${diferencia < 0 ? '-' : '+'} ${formatearCLP(Math.abs(diferencia))}   — NO cuadra`,
    ]);
  }
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margen, right: margen },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.1 },
    body: filasCuadratura,
    columnStyles: { 1: { halign: 'right', cellWidth: 60 } },
    didParseCell: (data) => {
      if (data.row.index === 2 || data.row.index === 4) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = GRIS_FONDO;
      }
    },
  });
  y = doc.lastAutoTable.finalY;

  if (efectivoContado != null && diferencia !== 0 && periodo.observacion_cuadratura) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    const lineas = doc.splitTextToSize(`Observación: ${periodo.observacion_cuadratura}`, anchoUtil);
    doc.text(lineas, margen, y + 5);
    y += 5 + lineas.length * 4;
  }
  y += 5;

  // ---- Monto a reintegrar ----
  if (montoReintegro != null) {
    if (y > altoPagina - 48) {
      doc.addPage();
      y = 16;
    }
    doc.setFillColor(...AZUL_OSCURO);
    doc.roundedRect(margen, y, anchoUtil, 17, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SE SOLICITA REINTEGRAR A LA CAJA CHICA:', margen + 4, y + 7);
    doc.text(formatearCLP(montoReintegro), margen + anchoUtil - 4, y + 7, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      `Efectivo en caja ${formatearCLP(efectivoContado)} + reintegro ${formatearCLP(montoReintegro)} = nuevo fondo ${formatearCLP(
        (efectivoContado || 0) + montoReintegro
      )} (inicia el siguiente folio)`,
      margen + 4,
      y + 13
    );
    doc.setTextColor(0, 0, 0);
    y += 17;
  }

  // ---- Firmas ----
  y += 20;
  if (y > altoPagina - 22) {
    doc.addPage();
    y = 40;
  }
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margen + 8, y, margen + 68, y);
  doc.line(anchoPagina - margen - 68, y, anchoPagina - margen - 8, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('RR.HH. / Administración', margen + 8, y + 4.5);
  doc.text('Gerencia', anchoPagina - margen - 68, y + 4.5);
  if (periodo.rendicion_aprobada_por_nombre) {
    doc.setFontSize(6.5);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(periodo.rendicion_aprobada_por_nombre, margen + 8, y + 8.5);
    doc.setTextColor(0, 0, 0);
  }

  // ---- Documentos de respaldo ----
  if (todosLosDocs.length) {
    const imagenes = await Promise.all(
      todosLosDocs.map((c) => (c.storage_path ? cargarImagenComprobante(c.storage_path) : Promise.resolve(null)))
    );

    const cols = 3;
    const gapX = 4;
    const anchoCelda = (anchoUtil - gapX * (cols - 1)) / cols;
    const altoImagen = 90;
    const altoEtiqueta = 6;
    const altoLeyenda = 15;
    const altoCelda = altoImagen + altoEtiqueta + altoLeyenda + 5;
    const porPagina = cols * 2;

    todosLosDocs.forEach((c, i) => {
      const pos = i % porPagina;
      if (pos === 0) {
        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...AZUL_OSCURO);
        doc.text(`DOCUMENTOS DE RESPALDO — CAJA CHICA FOLIO ${folio}`, margen, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS_TEXTO);
        doc.text(
          'Cada imagen lleva su N° de documento, para ubicarla en el detalle de la primera página.',
          margen,
          21
        );
        doc.setTextColor(0, 0, 0);
      }
      const fila = Math.floor(pos / cols);
      const col = pos % cols;
      const x = margen + col * (anchoCelda + gapX);
      const yTop = 26 + fila * altoCelda;

      // Marco + imagen
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.setFillColor(248, 250, 252);
      doc.rect(x, yTop, anchoCelda, altoImagen, 'FD');
      const img = imagenes[i];
      if (img?.tipo === 'imagen') {
        const pad = 1.5;
        const maxW = anchoCelda - pad * 2;
        const maxH = altoImagen - pad * 2;
        const escala = Math.min(maxW / img.ancho, maxH / img.alto);
        const w = img.ancho * escala;
        const h = img.alto * escala;
        doc.addImage(img.dataUrl, 'JPEG', x + (anchoCelda - w) / 2, yTop + (altoImagen - h) / 2, w, h);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...GRIS_TEXTO);
        const msg =
          img?.tipo === 'pdf'
            ? 'Comprobante en archivo PDF\n(consultar en la aplicación)'
            : c.storage_path
            ? 'No se pudo cargar la imagen'
            : 'Sin imagen adjunta';
        doc.text(msg, x + anchoCelda / 2, yTop + altoImagen / 2, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }

      // Etiqueta
      doc.setFillColor(...AZUL);
      doc.rect(x, yTop + altoImagen, anchoCelda, altoEtiqueta, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`Doc ${c.nDoc} · ${etiquetaDoc(c)}`, x + 1.5, yTop + altoImagen + 4.2);
      doc.text(formatearCLP(c.monto), x + anchoCelda - 1.5, yTop + altoImagen + 4.2, { align: 'right' });
      doc.setTextColor(0, 0, 0);

      // Leyenda (la reseña para la trazabilidad)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const leyenda = [
        ...(c.descripcion ? doc.splitTextToSize(`Detalle: ${c.descripcion}`, anchoCelda - 2).slice(0, 2) : []),
        `Solicitud N°${c.solicitudN} · ${fechaCorta(c.s.created_at)} · ${c.s.articulo || ''}`.slice(0, 70),
        `Compró: ${c.s.solicitante_nombre || '—'} · Autorizó: ${c.s.aprobador_nombre || '—'}`.slice(0, 70),
      ];
      let yy = yTop + altoImagen + altoEtiqueta + 3.5;
      leyenda.slice(0, 4).forEach((ln) => {
        doc.text(doc.splitTextToSize(ln, anchoCelda - 2)[0], x + 1, yy);
        yy += 3.2;
      });
    });
  }

  // ---- Pie de página en todas las hojas ----
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_TEXTO);
    doc.text(
      `Caja Chica · Folio ${folio}${periodo.codigo_verificacion ? ` · Código de verificación: ${periodo.codigo_verificacion}` : ''}`,
      margen,
      altoPagina - 7
    );
    doc.text(`Página ${p} de ${totalPaginas}`, anchoPagina - margen, altoPagina - 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`solicitud_reintegro_caja_chica_folio_${folio}.pdf`);
}
