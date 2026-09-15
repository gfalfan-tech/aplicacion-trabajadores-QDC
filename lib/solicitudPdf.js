import { jsPDF } from 'jspdf';
import {
  EMPRESA,
  formatFechaLarga,
  formatFechaCorta,
  dibujarMembrete,
  dibujarSelloEstado,
  dibujarFirmasVacaciones,
  dibujarFirmaTrabajador,
  dibujarLineaCorte,
  dibujarEtiquetaCopia,
  dibujarCuadroDesgloseVacaciones,
} from './pdfComun';

// Doble aprobación de vacaciones: la segunda firma (derecha) es siempre de
// esta persona, sin importar qué usuario de RR.HH. haya apretado "Aprobar"
// en el sistema — es quien firma en representación de RR.HH.
const SEGUNDO_FIRMANTE_RRHH = 'Cristian Seguel';

// Los comprobantes de permiso y vacaciones se imprimen DOS VECES en la
// misma hoja carta (una encima de la otra) para poder cortarla a la mitad:
// una mitad queda de respaldo en la empresa, la otra se le entrega física
// al trabajador — y en las dos mitades el trabajador firma a mano al pie,
// como respaldo por si la app llegara a fallar alguna vez. Mismo mecanismo
// que ya usaba el formulario en papel de feriado legal de la empresa (ver
// "ORIGINAL EMPRESA" / "COPIA TRABAJADOR" más abajo).
const ANCHO_PAGINA = 216; // carta, mm
const ALTO_PAGINA = 279.4; // carta, mm
const MITAD_PAGINA = ALTO_PAGINA / 2;
const MARGEN_IZQ = 20;
const MARGEN_DER = 20;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN_IZQ - MARGEN_DER;

/**
 * Dibuja UNA copia compacta del comprobante de permiso, empezando en
 * `yBase` (0 para la mitad de arriba de la hoja, MITAD_PAGINA para la de
 * abajo). `solicitud` debe traer: fecha_desde, fecha_hasta, hora_desde,
 * hora_hasta, motivo, estado, tipo_permiso (nombre), y de ser posible
 * fecha_resolucion/created_at (para que la fecha del comprobante quede
 * fija en la fecha real de la resolución, y no cambie cada vez que se
 * vuelve a ver el PDF). `trabajador` debe traer: nombre_completo, rut y,
 * si está disponible, jefe_directo.nombre_completo (para la firma de
 * "Jefe Directo").
 */
async function dibujarCopiaPermiso(doc, yBase, solicitud, trabajador) {
  let y = yBase + 9;

  y = await dibujarMembrete(doc, ANCHO_PAGINA, y, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUTORIZACIÓN DE PERMISO', ANCHO_PAGINA / 2, y, { align: 'center' });
  y += 9;

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
  doc.setFontSize(9.5);
  const lineas = doc.splitTextToSize(parrafo, ANCHO_UTIL);
  doc.text(lineas, MARGEN_IZQ, y, { align: 'left', lineHeightFactor: 1.35 });
  y += lineas.length * 4.4 + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`${EMPRESA.razonSocial} — ${EMPRESA.depto}`, MARGEN_IZQ, y);
  y += 4.4;
  doc.setFont('helvetica', 'normal');
  // Fecha de la resolución (fija), no la fecha de hoy — para que el
  // comprobante no cambie cada vez que se vuelve a ver o descargar.
  doc.text(
    `Santiago, ${formatFechaLarga(solicitud.fecha_resolucion || solicitud.created_at || new Date())}`,
    MARGEN_IZQ,
    y
  );
  y += 9;

  if (solicitud.estado === 'aprobada' || solicitud.estado === 'rechazada') {
    const aprobada = solicitud.estado === 'aprobada';
    y = dibujarSelloEstado(doc, solicitud.estado, ANCHO_PAGINA, y, undefined, aprobada, true);
    if (aprobada) {
      y = await dibujarFirmasVacaciones(
        doc,
        ANCHO_PAGINA,
        y,
        {
          jefeNombre: trabajador.jefe_directo?.nombre_completo,
          segundoFirmante: SEGUNDO_FIRMANTE_RRHH,
          timbre: 'rrhh',
        },
        true
      );
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(150);
    doc.text('Solicitud pendiente de revisión por la jefatura.', MARGEN_IZQ, y);
    doc.setTextColor(0);
    y += 5;
  }

  // Respaldo físico: la firma del trabajador va siempre, sin importar el
  // estado en el sistema — es justamente para cuando la app no está
  // disponible.
  dibujarFirmaTrabajador(doc, ANCHO_PAGINA, y, trabajador.nombre_completo, true);
}

/**
 * Igual que dibujarCopiaPermiso, para el comprobante de vacaciones. Además
 * del párrafo, incluye el cuadro de desglose (Días hábiles / Vacaciones
 * progresivas / Domingo e inhábiles / Saldo pendiente) y, si ya está
 * aprobada, las dos firmas de autorización (jefe directo + RR.HH.) además
 * de la firma del trabajador.
 *
 * `solicitud` debe traer: fecha_desde, fecha_hasta, dias_habiles, estado,
 * jefe_nombre, motivo_edicion, fecha_resolucion/created_at (fecha fija del
 * comprobante), y el desglose ya calculado: vacaciones_progresivas,
 * domingo_e_inhabiles, saldo_pendiente.
 */
async function dibujarCopiaVacaciones(doc, yBase, solicitud, trabajador) {
  let y = yBase + 6;

  y = await dibujarMembrete(doc, ANCHO_PAGINA, y, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUTORIZACIÓN DE VACACIONES', ANCHO_PAGINA / 2, y, { align: 'center' });
  y += 5;

  const parrafo =
    `${EMPRESA.razonSocial}, RUT ${EMPRESA.rut}, deja constancia que ${trabajador.nombre_completo}, ` +
    `RUT N°${trabajador.rut}, solicitó hacer uso de su feriado legal (vacaciones) desde el ` +
    `${formatFechaCorta(solicitud.fecha_desde)} hasta el ${formatFechaCorta(
      solicitud.fecha_hasta
    )}, equivalente a ${solicitud.dias_habiles} día(s) hábil(es).`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lineas = doc.splitTextToSize(parrafo, ANCHO_UTIL);
  doc.text(lineas, MARGEN_IZQ, y, { align: 'left', lineHeightFactor: 1.3 });
  y += lineas.length * 4.1 + 1;

  y =
    dibujarCuadroDesgloseVacaciones(doc, ANCHO_PAGINA, MARGEN_IZQ, MARGEN_DER, y, {
      diasHabiles: solicitud.dias_habiles,
      vacacionesProgresivas: solicitud.vacaciones_progresivas,
      domingoEInhabiles: solicitud.domingo_e_inhabiles,
      saldoPendiente: solicitud.saldo_pendiente,
    }) + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${EMPRESA.razonSocial} — ${EMPRESA.depto}`, MARGEN_IZQ, y);
  y += 3.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  // Fecha de la resolución (fija), no la fecha de hoy — mismo motivo que en
  // el comprobante de permiso.
  doc.text(
    `Santiago, ${formatFechaLarga(solicitud.fecha_resolucion || solicitud.created_at || new Date())}`,
    MARGEN_IZQ,
    y
  );
  y += 4.5;

  if (
    solicitud.estado === 'aprobada' ||
    solicitud.estado === 'rechazada' ||
    solicitud.estado === 'cancelada'
  ) {
    const aprobada = solicitud.estado === 'aprobada';
    y = dibujarSelloEstado(doc, solicitud.estado, ANCHO_PAGINA, y, solicitud.motivo_edicion, aprobada, true);
    if (aprobada) {
      y = await dibujarFirmasVacaciones(
        doc,
        ANCHO_PAGINA,
        y,
        {
          jefeNombre: solicitud.jefe_nombre,
          segundoFirmante: SEGUNDO_FIRMANTE_RRHH,
          timbre: 'rrhh',
        },
        true
      );
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      solicitud.estado === 'aprobada_jefe'
        ? 'Aprobada por tu jefe directo. Pendiente de la segunda firma de RR.HH.'
        : 'Solicitud pendiente de revisión por la jefatura.',
      MARGEN_IZQ,
      y
    );
    doc.setTextColor(0);
    y += 4;
  }

  // Respaldo físico: la firma del trabajador va siempre, sin importar el
  // estado en el sistema.
  dibujarFirmaTrabajador(doc, ANCHO_PAGINA, y, trabajador.nombre_completo, true);
}

async function armarPdfPermiso(solicitud, trabajador) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  await dibujarCopiaPermiso(doc, 0, solicitud, trabajador);
  dibujarLineaCorte(doc, ANCHO_PAGINA, MITAD_PAGINA);
  dibujarEtiquetaCopia(doc, ANCHO_PAGINA, MITAD_PAGINA - 3, 'ORIGINAL EMPRESA');
  await dibujarCopiaPermiso(doc, MITAD_PAGINA, solicitud, trabajador);
  dibujarEtiquetaCopia(doc, ANCHO_PAGINA, ALTO_PAGINA - 6, 'COPIA TRABAJADOR');
  return doc;
}

async function armarPdfVacaciones(solicitud, trabajador) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  await dibujarCopiaVacaciones(doc, 0, solicitud, trabajador);
  dibujarLineaCorte(doc, ANCHO_PAGINA, MITAD_PAGINA);
  dibujarEtiquetaCopia(doc, ANCHO_PAGINA, MITAD_PAGINA - 3, 'ORIGINAL EMPRESA');
  await dibujarCopiaVacaciones(doc, MITAD_PAGINA, solicitud, trabajador);
  dibujarEtiquetaCopia(doc, ANCHO_PAGINA, ALTO_PAGINA - 6, 'COPIA TRABAJADOR');
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
//
// `solicitud` tiene que venir con el desglose ya calculado (ver
// lib/vacacionesDesglose.js#armarDesgloseVacaciones): vacaciones_progresivas,
// domingo_e_inhabiles y saldo_pendiente.

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
