import { supabase } from '@/lib/supabaseClient';

export function formatearMinutosAtraso(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Trae el resumen de asistencia (inasistencias/atrasos) de un trabajador
// para el mes en curso. Si todavía no se ha subido el reporte del mes en
// curso, devuelve el último período cargado (y avisa que no es el actual)
// para no dejar la pantalla vacía apenas empieza el mes.
export async function obtenerAsistenciaMesActual(trabajadorId) {
  const { data } = await supabase
    .from('asistencia_mensual')
    .select('*')
    .eq('trabajador_id', trabajadorId)
    .order('periodo_desde', { ascending: false })
    .limit(6);

  if (!data || data.length === 0) return null;

  const hoy = new Date().toISOString().slice(0, 10);
  const delMes = data.find((r) => r.periodo_desde <= hoy && hoy <= r.periodo_hasta);
  if (delMes) return { ...delMes, esMesActual: true };
  return { ...data[0], esMesActual: false };
}
