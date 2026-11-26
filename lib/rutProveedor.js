// Helpers para el RUT chileno del proveedor (se usan en el formulario de
// rendición y en la ruta de API, así que no dependen de React ni del DOM).

// "76.123.456-7" -> "761234567" (sin puntos ni guion, K en mayúscula).
export function limpiarRut(valor) {
  return String(valor || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

// Dígito verificador (módulo 11) del cuerpo numérico del RUT.
function calcularDv(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

export function rutValido(valor) {
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  if (!/^\d+$/.test(cuerpo) || cuerpo.length < 6 || cuerpo.length > 8) return false;
  return calcularDv(cuerpo) === limpio.slice(-1);
}

// "761234567" -> "76.123.456-7". Si no se puede formatear, devuelve lo escrito.
export function formatearRut(valor) {
  const limpio = limpiarRut(valor);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}
