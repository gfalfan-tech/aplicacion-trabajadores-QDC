// Helpers compartidos para generar PDFs con el membrete/formato de QDC
// (mismo estilo que el Certificado de Antigüedad).

export const EMPRESA = {
  razonSocial: 'QUIMICA DEL CAMPO SPA',
  rut: '93.447.000-1',
  domicilio: 'Salar de Llamara N°812, Comuna de Pudahuel',
  depto: 'DPTO DE ADMINISTRACION',
};

export const LOGO_ANCHO_MM = 32;
export const LOGO_ALTO_MM = LOGO_ANCHO_MM * (71 / 160); // proporción real de /public/qdc-logo.png

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
// "NO AUTORIZADO") y, si corresponde, la nota de reenvío a jefatura.
export function dibujarSelloEstado(doc, estado, anchoPagina, y) {
  const esAprobada = estado === 'aprobada';
  const texto = esAprobada ? 'APROBADO' : 'NO AUTORIZADO';
  const color = esAprobada ? [22, 130, 60] : [180, 30, 30];

  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.rect(anchoPagina / 2 - 45, y - 12, 90, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...color);
  doc.text(texto, anchoPagina / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  let siguienteY = y + 18;
  if (!esAprobada) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('Favor dirigirse personalmente con su jefatura.', anchoPagina / 2, siguienteY, {
      align: 'center',
    });
    siguienteY += 8;
  }
  return siguienteY;
}
