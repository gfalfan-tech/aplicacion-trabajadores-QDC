import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Cuántas papeletas aprobadas todavía no están formalizadas (impresas y
// firmadas). Devuelve 0 a quien no tiene acceso.
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.puedeFormalizar) return NextResponse.json({ pendientes: 0 });

  const contar = async (tabla) => {
    const { count } = await auth.admin
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'aprobada')
      .is('formalizada_at', null);
    return count || 0;
  };
  const [permisos, vacaciones] = await Promise.all([contar('solicitudes_permiso'), contar('solicitudes_vacaciones')]);
  return NextResponse.json({ pendientes: permisos + vacaciones, permisos, vacaciones });
}
