import { jsPDF } from 'jspdf';
import {
  EMPRESA,
  formatFechaLarga,
  formatFechaCorta,
  dibujarMembrete,
  dibujarSelloEstado,
} from './pdfComun';

/**
 * Arma el PDF de "Autorización de Permiso" — comprobante de la solicitud,
 * esté pendiente, aprobada o rechazada (el sello solo se dibuja si ya fue
 * resuelta). `solicitud` debe traer: fecha_desde, fecha_hasta, hora_desde,
 * hora_hasta, motivo, estado, tipo_permiso (nombre). `trabajador` debe
 * traer: nombre_completo, rut. Devuelve el objeto jsPDF armado, sin
 * guardarlo ni abrirlo — eso lo hacen las funciones de más abajo.
 */
async function armarPdfPermiso(solicitud, trabajador) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margenIzq = 25;
  const margenDer = 25;
  const anchoPagina = 216;
  const anchoUtil = anchoPagina - margenIzq - margenDer;
  let y = 20;

  y = await dibujarMembrete(doc, anchoPagina, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('AUTORIZACION DE PERMISO', anchoPagina / 2, y, { align: 'center' });
  y += 20;

  const dias =
    solicitud.fecha_desde === solicitud.fecha_hasta
      ? `el día ${formatFechaCorta(solicitud.fecha_desde)}`
      : `desde el ${formatFechaCorta(solicitud.fecha_desde)} hasta el ${formatFechaCorta(
          solicitud.fecha_hasta
        )}`;

  const horas =
    solicitud.hora_desde && solicitud.hora_hasta
      ? ` entre las ${solicitud.hora_desde.slice(0, 5)} y las ${solicitud.hora_hasta.slice(
          0,
          5
        )} horas`
      : '';

  const motivo = (solicitud.motivo && solicitud.motivo.trim()) || solicitud.tipo_permiso || '—';

  const parrafo =
    `${EMPRESA.razonSocial}, RUT ${EMPRESA.rut}, domiciliada en ${EMPRESA.domicilio}, ` +
    `deja constancia que ${trabajador.nombre_completo}, RUT N°${trabajador.rut}, solicitó permiso ` +
    `${dias}${horas}, por motivo de "${motivo}".`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const lineas = doc.splitTextToSize(parrafo, anchoUtil);
  doc.text(lineas, margenIzq, y, { align: 'left', lineHeightFactor: 1.6 });
  y += lineas.length * 7 + 16;

  doc.setFont('helvetica', 'bold');
  doc.text(EMPRESA.razonSocial, margenIzq, y);
  y += 6;
  doc.text(EMPRESA.depto, margenIzq, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Santiago, ${formatFechaLarga(new Date())}`, margenIzq, y);
  y += 24;

  if (solicitud.estado === 'aprobada' || solicitud.estado === 'rechazada') {
    dibujarSelloEstado(doc, solicitud.estado, anchoPagina, y);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Solicitud pendiente de revisión por la jefatura.', margenIzq, y);
    doc.setTextColor(0);
  }

  return doc;
}

/**
 * Arma el PDF de "Autorización de Vacaciones" — mismo criterio que el de
 * permiso: es un comprobante disponible siempre, con o sin sello. `solicitud`
 * debe traer: fecha_desde, fecha_hasta, dias_habiles, estado. `trabajador`:
 * nombre_completo, rut.
 */
async function armarPdfVacaciones(solicitud, trabajador) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margenIzq = 25;
  const margenDer = 25;
  const anchoPagina = 216;
  const anchoUtil = anchoPagina - margenIzq - margenDer;
  let y = 20;

  y = await dibujarMembrete(doc, anchoPagina, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('AUTORIZACION DE VACACIONES', anchoPagina / 2, y, { align: 'center' });
  y += 20;

  const parrafo =
    `${EMPRESA.razonSocial}, RUT ${EMPRESA.rut}, domiciliada en ${EMPRESA.domicilio}, ` +
    `deja constancia que ${trabajador.nombre_completo}, RUT N°${trabajador.rut}, solicitó hacer uso ` +
    `de su feriado legal (vacaciones) desde el ${formatFechaCorta(
      solicitud.fecha_desde
    )} hasta el ${formatFechaCorta(solicitud.fecha_hasta)}, equivalente a ${
      solicitud.dias_habiles
    } día(s) hábil(es).`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const lineas = doc.splitTextToSize(parrafo, anchoUtil);
  doc.text(lineas, margenIzq, y, { align: 'left', lineHeightFactor: 1.6 });
  y += lineas.length * 7 + 16;

  doc.setFont('helvetica', 'bold');
  doc.text(EMPRESA.razonSocial, margenIzq, y);
  y += 6;
  doc.text(EMPRESA.depto, margenIzq, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Santiago, ${formatFechaLarga(new Date())}`, margenIzq, y);
  y += 24;

  if (solicitud.estado === 'aprobada' || solicitud.estado === 'rechazada') {
    dibujarSelloEstado(doc, solicitud.estado, anchoPagina, y);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Solicitud pendiente de revisión por la jefatura.', margenIzq, y);
    doc.setTextColor(0);
  }

  return doc;
}

function nombreArchivoPermiso(trabajador) {
  return `permiso_${(trabajador.rut || '').replace(/\./g, '').replace(/-/g, '')}.pdf`;
}

function nombreArchivoVacaciones(trabajador) {
  return `vacaciones_${(trabajador.rut || '').replace(/\./g, '').replace(/-/g, '')}.pdf`;
}

// --- Permiso: ver (nueva pestaña) o descargar -------------------------------

export async function verPdfPermiso(solicitud, trabajador) {
  const doc = await armarPdfPermiso(solicitud, trabajador);
  window.open(doc.output('bloburl'), '_blank');
}

export async function descargarPdfPermiso(solicitud, trabajador) {
  const doc = await armarPdfPermiso(solicitud, trabajador);
  doc.save(nombreArchivoPermiso(trabajador));
}

// --- Vacaciones: ver (nueva pestaña) o descargar ----------------------------

export async function verPdfVacaciones(solicitud, trabajador) {
  const doc = await armarPdfVacaciones(solicitud, trabajador);
  window.open(doc.output('bloburl'), '_blank');
}

export async function descargarPdfVacaciones(solicitud, trabajador) {
  const doc = await armarPdfVacaciones(solicitud, trabajador);
  doc.save(nombreArchivoVacaciones(trabajador));
}

// Se mantienen estos dos nombres (comportamiento = descargar) para no romper
// otros lugares que ya los importaban.
export const generarPdfPermiso = descargarPdfPermiso;
export const generarPdfVacaciones = descargarPdfVacaciones;
