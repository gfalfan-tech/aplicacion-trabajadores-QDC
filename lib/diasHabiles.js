import { supabase } from '@/lib/supabaseClient';

/**
 * Cuenta los días hábiles entre dos fechas (ambas incluidas) para efectos
 * de vacaciones: de lunes a viernes, sin contar sábados, domingos ni
 * feriados legales (la tabla "feriados" en Supabase — ver
 * supabase/migrations/feriados.sql).
 */
export async function calcularDiasHabiles(desde, hasta) {
  if (!desde || !hasta) return 0;

  const { data: feriadosData } = await supabase
    .from('feriados')
    .select('fecha')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  const feriados = new Set((feriadosData || []).map((f) => f.fecha));

  let d = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  let n = 0;
  while (d <= fin) {
    const diaSemana = d.getDay();
    const fechaISO = d.toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !feriados.has(fechaISO)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
