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

  // Vacaciones tiene doble aprobación: para jefatura, "pendiente" (lo suyo,
  // como antes, sin cambios). Para RR.HH. hay que contar solo lo que
  // realmente le toca a RR.HH. resolver: 'pendiente' de trabajadores SIN
  // jefe directo válido (ahí RR.HH. es la única aprobación) más TODAS las
  // que están en 'aprobada_jefe' (segunda firma) — así el número no incluye
  // solicitudes que todavía dependen del jefe directo de esa persona.
  async function contarVacaciones() {
    if (!esRRHH) {
      return contar('solicitudes_vacaciones', 'estado', 'pendiente', 'trabajador_id');
    }

    const { count: segundaFirma } = await admin
      .from('solicitudes_vacaciones')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'aprobada_jefe');

    const { data: trabajadores } = await admin.from('trabajadores').select('id, jefe_directo_id');
    const idsJefes = [...new Set((trabajadores || []).map((t) => t.jefe_directo_id).filter(Boolean))];
    let jefesValidos = new Set();
    if (idsJefes.length > 0) {
      const { data: rolesJefes } = await admin
        .from('trabajador_roles')
        .select('trabajador_id')
        .in('trabajador_id', idsJefes)
        .in('rol', ['jefatura', 'rrhh', 'administrador']);
      jefesValidos = new Set((rolesJefes || []).map((r) => r.trabajador_id));
    }
    const idsSinJefeValido = (trabajadores || [])
      .filter((t) => !t.jefe_directo_id || !jefesValidos.has(t.jefe_directo_id))
      .map((t) => t.id);

    let pendientesSinJefe = 0;
    if (idsSinJefeValido.length > 0) {
      const { count } = await admin
        .from('solicitudes_vacaciones')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
        .in('trabajador_id', idsSinJefeValido);
      pendientesSinJefe = count || 0;
    }

    return (segundaFirma || 0) + pendientesSinJefe;
  }

  const [vacaciones, permisos, certificados, cajaChica] = await Promise.all([
    contarVacaciones(),
    contar('solicitudes_permiso', 'estado', 'pendiente', 'trabajador_id'),
    esRRHH ? contar('certificados_antiguedad', 'estado', 'solicitado', 'trabajador_id') : Promise.resolve(0),
    contar('caja_chica_solicitudes', 'estado', 'pendiente', 'solicitante_id'),
  ]);

  return NextResponse.json({ certificados, vacaciones, permisos, cajaChica });
}
