import { jsPDF } from 'jspdf';

const EMPRESA = {
  razonSocial: 'QUIMICA DEL CAMPO SPA',
  rut: '93.447.000-1',
  domicilio: 'Salar de Llamara N°812, Comuna de Pudahuel',
  depto: 'DPTO DE ADMINISTRACION',
};

const TIPO_CONTRATO_TEXTO = {
  INDEFINIDO: 'indefinido',
  PLAZO_FIJO: 'a plazo fijo',
  POR_OBRA: 'por obra o faena',
};

function formatFechaLarga(fecha) {
  return new Date(fecha).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatFechaIngreso(fecha) {
  return new Date(fecha).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Genera el PDF del Certificado de Antigüedad y lo descarga en el navegador.
 * `trabajador` debe traer: nombre_completo, rut, cargo, fecha_ingreso, tipo_contrato
 */
export function generarCertificadoAntiguedadPdf(trabajador) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const margenIzq = 25;
  const margenDer = 25;
  const anchoUtil = 216 - margenIzq - margenDer; // carta = 216mm de ancho
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('C E R T I F I C A D O', 216 / 2, y, { align: 'center' });
  y += 20;

  const tipoContratoTexto = TIPO_CONTRATO_TEXTO[trabajador.tipo_contrato] || 'indefinido';

  const parrafo =
    `${EMPRESA.razonSocial}, RUT ${EMPRESA.rut}, domiciliada en ${EMPRESA.domicilio}, ` +
    `certifica que ${trabajador.nombre_completo}, RUT N°${trabajador.rut}, es empleado(a) de ` +
    `nuestra empresa desde el ${formatFechaIngreso(trabajador.fecha_ingreso)}, con contrato ${tipoContratoTexto}, ` +
    `desempeñando el cargo de ${trabajador.cargo || '—'}.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const lineas = doc.splitTextToSize(parrafo, anchoUtil);
  doc.text(lineas, margenIzq, y, { align: 'left', lineHeightFactor: 1.6 });
  y += lineas.length * 7 + 12;

  doc.text('Se extiende el presente certificado a petición del interesado', margenIzq, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.text(EMPRESA.razonSocial, margenIzq, y);
  y += 6;
  doc.text(EMPRESA.depto, margenIzq, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Santiago, ${formatFechaLarga(new Date())}`, margenIzq, y);

  const nombreArchivo = `certificado_antiguedad_${(trabajador.rut || '').replace(/\./g, '').replace(/-/g, '')}.pdf`;
  doc.save(nombreArchivo);
}
