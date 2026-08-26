import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Resumen de "cuántas solicitudes tengo pendientes de aprobar" — para la
// alerta visual del dashboard (RR.HH. y jefaturas). RR.HH. ve todo lo de
// la empresa; una jefatura sin RR.HH. ve solo lo de su propio equipo, y
// no ve certificados (esos los resuelve solo RR.HH.).
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH, esJefatura } = auth;

  if (!esRRHH && !esJefatura) {
    return NextResponse.json({ certificados: 0, vacaciones: 0, permisos: 0, cajaChica: 0 });
  }

  let idsEquipo = [];
  if (!esRRHH) {
    const { data: equipo } = await admin
      .from('trabajadores')
      .select('id')
      .eq('jefe_directo_id', user.id);
    idsEquipo = (equipo || []).map((t) => t.id);
  }

  async function contar(tabla, columnaEstado, valorEstado, columnaTrabajador) {
    let q = admin.from(tabla).select('id', { count: 'exact', head: true }).eq(columnaEstado, valorEstado);
    if (!esRRHH) {
      if (idsEquipo.length === 0) return 0;
      q = q.in(columnaTrabajador, idsEquipo);
    }
    const { count } = await q;
    return count || 0;
  }

  const [vacaciones, permisos, certificados, cajaChica] = await Promise.all([
    contar('solicitudes_vacaciones', 'estado', 'pendiente', 'trabajador_id'),
    contar('solicitudes_permiso', 'estado', 'pendiente', 'trabajador_id'),
    esRRHH ? contar('certificados_antiguedad', 'estado', 'solicitado', 'trabajador_id') : Promise.resolve(0),
    contar('caja_chica_solicitudes', 'estado', 'pendiente', 'solicitante_id'),
  ]);

  return NextResponse.json({ certificados, vacaciones, permisos, cajaChica });
}
