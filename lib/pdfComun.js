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
// posición Y desde donde seguir escribiendo. `anchoLogoMm` permite un logo
// más chico (ver dibujarComprobanteDuplicado más abajo, donde dos
// comprobantes completos tienen que caber en una sola hoja).
export async function dibujarMembrete(doc, anchoPagina, y, anchoLogoMm = LOGO_ANCHO_MM) {
  const altoLogoMm = anchoLogoMm * (448 / 1008);
  try {
    const logoDataUrl = await cargarLogoBase64();
    doc.addImage(logoDataUrl, 'PNG', anchoPagina / 2 - anchoLogoMm / 2, y, anchoLogoMm, altoLogoMm);
    return y + altoLogoMm + (anchoLogoMm >= LOGO_ANCHO_MM ? 12 : 5);
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
export function dibujarSelloEstado(doc, estado, anchoPagina, y, motivo, sinRectangulo = false, compacto = false) {
  const esAprobada = estado === 'aprobada';
  const esCancelada = estado === 'cancelada';
  const texto = esAprobada ? 'APROBADO' : esCancelada ? 'CANCELADO' : 'NO AUTORIZADO';
  const color = esAprobada ? [22, 130, 60] : esCancelada ? [100, 100, 100] : [180, 30, 30];

  const anchoRect = compacto ? 62 : 90;
  const altoRect = compacto ? 11 : 20;
  const tamFuente = compacto ? 11.5 : 20;

  if (!(esAprobada && sinRectangulo)) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    doc.rect(anchoPagina / 2 - anchoRect / 2, y - altoRect * 0.6, anchoRect, altoRect);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(tamFuente);
    doc.setTextColor(...color);
    doc.text(texto, anchoPagina / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  let siguienteY = y + (compacto ? 9 : 18);
  if (esCancelada) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(compacto ? 8 : 10);
    const lineas = doc.splitTextToSize(`Motivo: ${motivo || '—'}`, anchoPagina - 60);
    doc.text(lineas, anchoPagina / 2, siguienteY, { align: 'center' });
    siguienteY += lineas.length * (compacto ? 3.8 : 5) + (compacto ? 2 : 3);
  } else if (!esAprobada) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(compacto ? 8 : 10);
    doc.text('Favor dirigirse personalmente con su jefatura.', anchoPagina / 2, siguienteY, {
      align: 'center',
    });
    siguienteY += compacto ? 6 : 8;
  }
  return siguienteY;
}

// Dibuja UN bloque de firma centrado en centroX: espacio en blanco para
// firmar a mano, una línea, el nombre en negrita debajo, y opcionalmente un
// cargo/rol en chico debajo del nombre. Devuelve el Y donde termina el
// bloque (para poder encadenar otros debajo).
export function dibujarLineaFirma(doc, centroX, y, anchoLinea, nombre, rol, compacto = false) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(centroX - anchoLinea / 2, y, centroX + anchoLinea / 2, y);

  let yTexto = y + (compacto ? 4 : 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compacto ? 8.5 : 10);
  doc.text(nombre || '—', centroX, yTexto, { align: 'center' });

  if (rol) {
    yTexto += compacto ? 3.6 : 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(compacto ? 7 : 8);
    doc.setTextColor(100);
    doc.text(rol, centroX, yTexto, { align: 'center' });
    doc.setTextColor(0);
  }

  return yTexto;
}

// Dibuja SOLO la firma del trabajador, centrada — el respaldo físico que se
// pide siempre (esté aprobada, rechazada o pendiente la solicitud): esto es
// justamente para cuando el sistema no está disponible, así que no depende
// del estado que haya quedado guardado en la app.
export function dibujarFirmaTrabajador(doc, anchoPagina, y, trabajadorNombre, compacto = false) {
  const yLinea = y + (compacto ? 6 : 14);
  return dibujarLineaFirma(doc, anchoPagina / 2, yLinea, compacto ? 55 : 60, trabajadorNombre, 'Firma del trabajador', compacto);
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

// Dibuja la sección de firmas de una solicitud de vacaciones (o permiso) ya
// aprobada: dos firmas de autorización lado a lado (jefe directo a la
// izquierda, segundo firmante de RR.HH. a la derecha), cada una con su
// espacio en blanco arriba de la línea para firmar a mano. El timbre
// institucional va aparte, más abajo, centrado en el espacio en blanco que
// queda del lado derecho antes de la firma del trabajador — así no se monta
// encima de la línea de RR.HH. y esa firma queda completamente libre.
// Devuelve el Y donde termina todo el bloque (listo para encadenar la firma
// del trabajador debajo).
export async function dibujarFirmasVacaciones(
  doc,
  anchoPagina,
  y,
  { jefeNombre, segundoFirmante, timbre },
  compacto = false
) {
  const centroIzq = anchoPagina / 2 - (compacto ? 38 : 45);
  const centroDer = anchoPagina / 2 + (compacto ? 38 : 45);
  const anchoLineaFirma = compacto ? 48 : 60;

  const yLineaSuperior = y + (compacto ? 7 : 14); // espacio en blanco para la firma a mano
  dibujarLineaFirma(doc, centroIzq, yLineaSuperior, anchoLineaFirma, jefeNombre, 'Autorizado por · Jefe Directo', compacto);
  const yFinFirmas = dibujarLineaFirma(
    doc,
    centroDer,
    yLineaSuperior,
    anchoLineaFirma,
    segundoFirmante,
    'Autorizado por · RR.HH.',
    compacto
  );

  // Espacio en blanco entre el final de las firmas y la firma del
  // trabajador (que agrega su propio margen superior al dibujarse, ver
  // dibujarFirmaTrabajador) — el timbre queda centrado ahí, del lado
  // derecho, más grande que antes para que se note bien.
  const espacioTrasFirmas = compacto ? 24 : 30;
  const yFinal = yFinFirmas + espacioTrasFirmas;
  const cyTimbre = yFinFirmas + (compacto ? 15 : 19);
  await dibujarTimbre(doc, timbre, centroDer, cyTimbre, compacto ? 22 : 30);

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

// --- Comprobante duplicado (permisos/vacaciones) ----------------------------
//
// Los comprobantes de permiso y vacaciones se imprimen DOS VECES en la
// misma hoja carta, uno debajo del otro, para poder cortar la hoja a la
// mitad: la mitad de arriba queda como respaldo de la empresa, la de abajo
// se le entrega físicamente al trabajador (que además firma a mano al pie,
// como respaldo por si la app llegara a fallar). Mismo criterio que ya
// usaba el formulario en papel de feriado legal de la empresa.

// Línea punteada + texto "CORTAR AQUÍ" en la mitad exacta de la hoja.
export function dibujarLineaCorte(doc, anchoPagina, y) {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(10, y, anchoPagina - 10, y);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text('- - - - - - - -  CORTAR AQUÍ  - - - - - - - -', anchoPagina / 2, y - 1.6, {
    align: 'center',
  });
  doc.setTextColor(0);
}

// Etiqueta chica y discreta al pie de cada mitad ("ORIGINAL EMPRESA" /
// "COPIA TRABAJADOR"), igual que el formulario en papel.
export function dibujarEtiquetaCopia(doc, anchoPagina, y, texto) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(texto, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0);
}

// Cuadro ordenado con el desglose de la solicitud de vacaciones: Días
// Hábiles / Vacaciones Progresivas / Domingo e Inhábiles / Saldo Pendiente
// — mismas 4 líneas que traía el formulario de feriado legal en papel.
// Devuelve el Y donde termina el cuadro.
export function dibujarCuadroDesgloseVacaciones(
  doc,
  anchoPagina,
  margenIzq,
  margenDer,
  y,
  { diasHabiles, vacacionesProgresivas, domingoEInhabiles, saldoPendiente }
) {
  const anchoCuadro = anchoPagina - margenIzq - margenDer;
  const xIzq = margenIzq;
  const xDer = anchoPagina - margenDer;
  const altoFila = 4.3;
  const filas = [
    ['Días hábiles', diasHabiles],
    ['Vacaciones progresivas', vacacionesProgresivas],
    ['Domingo e inhábiles', domingoEInhabiles],
    ['Saldo pendiente', saldoPendiente],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text('DETALLE DEL FERIADO', xIzq + 3, y);
  doc.setTextColor(0);

  const yCuadro = y + 2.5;
  const altoCuadro = altoFila * filas.length;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(xIzq, yCuadro, anchoCuadro, altoCuadro);

  filas.forEach(([etiqueta, valor], i) => {
    const yFila = yCuadro + altoFila * i;
    const yTexto = yFila + altoFila / 2 + 1.5;
    const esUltima = i === filas.length - 1;

    if (i > 0) {
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.2);
      doc.line(xIzq, yFila, xDer, yFila);
    }
    if (esUltima) {
      doc.setFillColor(245, 247, 250);
      doc.rect(xIzq + 0.15, yFila + 0.15, anchoCuadro - 0.3, altoFila - 0.3, 'F');
    }

    doc.setFont('helvetica', esUltima ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.text(etiqueta, xIzq + 3, yTexto);
    doc.text(String(valor ?? '—'), xDer - 3, yTexto, { align: 'right' });
  });

  return yCuadro + altoCuadro;
}
