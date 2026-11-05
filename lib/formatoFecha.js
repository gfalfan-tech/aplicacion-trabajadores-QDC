// Muestra una fecha 'AAAA-MM-DD' (como viene de la base de datos) en el
// formato chileno día-mes-año: '2026-11-04' -> '04-11-2026'.
// Es solo cambio de texto (sin Date), así que no hay desfases de zona horaria.
// Si el valor no tiene ese formato (vacío, otra cosa), lo devuelve tal cual.
export function fechaDMA(fechaISO) {
  if (!fechaISO) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaISO));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(fechaISO);
}
