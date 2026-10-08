/**
 * Redondea un número de días hacia abajo al 0.5 más cercano.
 * Ejemplo: 14.33 → 14,  14.83 → 14.5,  15.0 → 15
 *
 * IMPORTANTE: Esta función es SOLO para visualización.
 * Los cálculos internos deben seguir usando los valores exactos.
 */
export function redondearDias(n) {
  const v = Number(n || 0);
  return Math.floor(v * 2) / 2;
}

/**
 * Formatea un número de días para mostrar al usuario.
 * Aplica redondeo visual (0.5 en 0.5, hacia abajo) y formato chileno.
 */
export function formatDias(n) {
  const v = redondearDias(n);
  return v.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/**
 * Formatea días disponibles para mostrar al usuario.
 * Aplica Math.max(0, ...) y redondeo visual.
 * Reemplaza el patrón: Math.max(0, saldo.dias_disponibles_estimados)
 */
export function formatDiasDisponibles(valor) {
  if (valor == null) return '—';
  return formatDias(Math.max(0, valor));
}
