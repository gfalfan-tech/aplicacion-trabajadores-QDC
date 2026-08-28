// Helpers compartidos para generar PDFs con el membrete/formato de QDC
// (mismo estilo que el Certificado de Antigüedad).

export const EMPRESA = {
  razonSocial: 'QUIMICA DEL CAMPO SPA',
  rut: '93.447.000-1',
  domicilio: 'Salar de Llamara N°812, Comuna de Pudahuel',
  depto: 'DPTO DE ADMINISTRACION',
};

export const LOGO_ANCHO_MM = 32;
export const LOGO_ALTO_MM = LOGO_ANCHO_MM * (448 / 1008); // proporción real de /public/qdc-logo.png

export function formatFechaLarga(fecha) {
  return new Date(fecha).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Formatea una fecha "YYYY-MM-DD" sin pasar por Date/UTC, para no correr un
// día por la conversión de zona horaria.
export function formatFechaCorta(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function cargarLogoBase64() {
  const res = await fetch('/qdc-logo.png');
  if (!res.ok) throw new Error('No se pudo cargar el logo');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Dibuja el membrete (logo centrado) al inicio del documento y devuelve la
// posición Y desde donde seguir escribiendo.
export async function dibujarMembrete(doc, anchoPagina, y) {
  try {
    const logoDataUrl = await cargarLogoBase64();
    doc.addImage(
      logoDataUrl,
      'PNG',
      anchoPagina / 2 - LOGO_ANCHO_MM / 2,
      y,
      LOGO_ANCHO_MM,
      LOGO_ALTO_MM
    );
    return y + LOGO_ALTO_MM + 12;
  } catch (e) {
    return y + 8;
  }
}

// Dibuja, al pie del documento, el sello grande de estado ("APROBADO" /
// "NO AUTORIZADO" / "CANCELADO") y, si corresponde, la nota de reenvío a
// jefatura o el motivo de la cancelación (`motivo`, opcional — se usa solo
// para estado "cancelada").
// `sinRectangulo` se usa cuando la aprobación ya va a llevar el timbre
// institucional (ver dibujarTimbre más abajo) — en ese caso el rectángulo
// verde "APROBADO" es redundante y se omite; para rechazada/cancelada
// (que nunca llevan timbre) el rectángulo de texto sigue siendo la única
// marca, así que ahí siempre se dibuja.
export function dibujarSelloEstado(doc, estado, anchoPagina, y, motivo, sinRectangulo = false) {
  const esAprobada = estado === 'aprobada';
  const esCancelada = estado === 'cancelada';
  const texto = esAprobada ? 'APROBADO' : esCancelada ? 'CANCELADO' : 'NO AUTORIZADO';
  const color = esAprobada ? [22, 130, 60] : esCancelada ? [100, 100, 100] : [180, 30, 30];

  if (!(esAprobada && sinRectangulo)) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    doc.rect(anchoPagina / 2 - 45, y - 12, 90, 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...color);
    doc.text(texto, anchoPagina / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  let siguienteY = y + 18;
  if (esCancelada) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    const lineas = doc.splitTextToSize(`Motivo: ${motivo || '—'}`, anchoPagina - 60);
    doc.text(lineas, anchoPagina / 2, siguienteY, { align: 'center' });
    siguienteY += lineas.length * 5 + 3;
  } else if (!esAprobada) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Favor dirigirse personalmente con su jefatura.', anchoPagina / 2, siguienteY, {
      align: 'center',
    });
    siguienteY += 8;
  }
  return siguienteY;
}

// Dibuja UN bloque de firma centrado en centroX: espacio en blanco para
// firmar a mano, una línea, el nombre en negrita debajo, y opcionalmente un
// cargo/rol en chico debajo del nombre. Devuelve el Y donde termina el
// bloque (para poder encadenar otros debajo).
function dibujarLineaFirma(doc, centroX, y, anchoLinea, nombre, rol) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(centroX - anchoLinea / 2, y, centroX + anchoLinea / 2, y);

  let yTexto = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(nombre || '—', centroX, yTexto, { align: 'center' });

  if (rol) {
    yTexto += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(rol, centroX, yTexto, { align: 'center' });
    doc.setTextColor(0);
  }

  return yTexto;
}

// --- Timbres institucionales (RR.HH. / Finanzas) ----------------------------
//
// Se superponen a la firma de la derecha (RR.HH. en vacaciones/permisos,
// Finanzas en rendición de gastos/caja chica) para que el PDF se vea como
// un documento timbrado de verdad. Si por lo que sea la imagen no carga
// (ej. problema de red al pedir el archivo), el PDF igual se termina de
// generar — solo queda sin la marca gráfica, nunca rompe la descarga.
const ARCHIVO_TIMBRE = {
  rrhh: '/timbre-rrhh.png',
  finanzas: '/timbre-finanzas.png',
};

async function cargarTimbreBase64(tipo) {
  const res = await fetch(ARCHIVO_TIMBRE[tipo]);
  if (!res.ok) throw new Error('No se pudo cargar el timbre');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function dibujarTimbre(doc, tipo, cx, cy, diametroMm = 24) {
  if (!tipo) return;
  try {
    const dataUrl = await cargarTimbreBase64(tipo);
    doc.addImage(dataUrl, 'PNG', cx - diametroMm / 2, cy - diametroMm / 2, diametroMm, diametroMm);
  } catch (e) {
    // Silencioso a propósito — ver comentario de arriba.
  }
}

// Dibuja la sección de firmas de una solicitud de vacaciones ya aprobada:
// dos firmas de autorización lado a lado (jefe directo a la izquierda,
// segundo firmante de RR.HH. a la derecha) y, más abajo, la firma del
// trabajador. Cada una con su espacio en blanco arriba de la línea para
// firmar a mano. Devuelve el Y donde termina todo el bloque.
export async function dibujarFirmasVacaciones(
  doc,
  anchoPagina,
  y,
  { jefeNombre, segundoFirmante, trabajadorNombre, timbre }
) {
  const centroIzq = anchoPagina / 2 - 45;
  const centroDer = anchoPagina / 2 + 45;
  const anchoLineaFirma = 60;

  const yLineaSuperior = y + 14; // espacio en blanco para la firma a mano
  dibujarLineaFirma(doc, centroIzq, yLineaSuperior, anchoLineaFirma, jefeNombre, 'Autorizado por · Jefe Directo');
  dibujarLineaFirma(doc, centroDer, yLineaSuperior, anchoLineaFirma, segundoFirmante, 'Autorizado por · RR.HH.');
  await dibujarTimbre(doc, timbre, centroDer, yLineaSuperior - 10, 24);

  const yLineaTrabajador = yLineaSuperior + 26; // deja espacio para la firma del trabajador
  const yFinal = dibujarLineaFirma(
    doc,
    anchoPagina / 2,
    yLineaTrabajador,
    anchoLineaFirma,
    trabajadorNombre,
    'Firma del trabajador'
  );

  return yFinal;
}

// Igual que dibujarFirmasVacaciones, pero para Rendición de Gastos: a la
// derecha no va el nombre de una persona — va literalmente el texto
// "Autorizado por Finanzas" (sin importar qué usuario de RR.HH./
// administrador haya aprobado en el sistema), sin una leyenda de cargo
// debajo (el texto ya lo dice todo).
export async function dibujarFirmasRendicionGastos(doc, anchoPagina, y, { jefeNombre, trabajadorNombre }) {
  const centroIzq = anchoPagina / 2 - 45;
  const centroDer = anchoPagina / 2 + 45;
  const anchoLineaFirma = 60;

  const yLineaSuperior = y + 14; // espacio en blanco para la firma a mano
  dibujarLineaFirma(doc, centroIzq, yLineaSuperior, anchoLineaFirma, jefeNombre, 'Autorizado por · Jefe Directo');
  dibujarLineaFirma(doc, centroDer, yLineaSuperior, anchoLineaFirma, 'Autorizado por Finanzas', null);
  await dibujarTimbre(doc, 'finanzas', centroDer, yLineaSuperior - 10, 24);

  const yLineaTrabajador = yLineaSuperior + 26; // deja espacio para la firma del trabajador
  const yFinal = dibujarLineaFirma(
    doc,
    anchoPagina / 2,
    yLineaTrabajador,
    anchoLineaFirma,
    trabajadorNombre,
    'Firma del trabajador'
  );

  return yFinal;
}
