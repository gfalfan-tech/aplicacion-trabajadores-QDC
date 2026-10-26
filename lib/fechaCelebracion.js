// Utilidades de fecha para las publicaciones automáticas de cumpleaños y
// aniversario (ver app/api/cron/celebraciones/route.js).

// Cuántos días queda visible la publicación, contando el día de la
// celebración como día 1 (ej.: cumpleaños el 26 → visible 26, 27, 28, 29 y 30).
export const DIAS_VIGENCIA_CELEBRACION = 5;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// "26 de octubre" (sin año, porque el saludo es del año en curso).
export function fechaLarga(mes, dia) {
  return `${dia} de ${MESES[mes - 1]}`;
}

// Devuelve 'YYYY-MM-DD' sumando `dias` a la fecha dada. Se calcula en UTC
// para no depender de la zona horaria del servidor.
export function sumarDiasISO(anio, mes, dia, dias) {
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}
