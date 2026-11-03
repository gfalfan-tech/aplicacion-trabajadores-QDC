import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

const TABLAS = { permiso: 'solicitudes_permiso', vacaciones: 'solicitudes_vacaciones' };

// Marca (o desmarca) una papeleta como formalizada: ya se imprimió, se firmó
// y se archivó. Queda registrado quién y cuándo. Solo para solicitudes ya
// aprobadas.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.puedeFormalizar) {
    return NextResponse.json({ error: 'No tienes permiso para formalizar papeletas.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tabla = TABLAS[body?.tipo];
  const { id, formalizada } = body || {};
  if (!tabla || !id || typeof formalizada !== 'boolean') {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }

  const { data: solicitud } = await auth.admin.from(tabla).select('id, estado').eq('id', id).maybeSingle();
  if (!solicitud) return NextResponse.json({ error: 'No se encontró esa solicitud.' }, { status: 404 });
  if (solicitud.estado !== 'aprobada') {
    return NextResponse.json({ error: 'Solo se formalizan solicitudes aprobadas.' }, { status: 409 });
  }

  const cambios = formalizada
    ? { formalizada_at: new Date().toISOString(), formalizada_por: auth.user.id }
    : { formalizada_at: null, formalizada_por: null };
  const { error } = await auth.admin.from(tabla).update(cambios).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: yo } = await auth.admin
    .from('trabajadores')
    .select('nombre_completo')
    .eq('id', auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    formalizada_at: cambios.formalizada_at,
    formalizada_por_nombre: formalizada ? yo?.nombre_completo || null : null,
  });
}
