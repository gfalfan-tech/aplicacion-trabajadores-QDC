import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Lista/administra los "aprobadores de respaldo": quienes pueden aprobar
// una solicitud de caja chica cuando el solicitante no tiene un jefe
// directo con acceso al módulo (por ejemplo, si RR.HH./administrador
// solicita, o a alguien de jefatura no se le asignó jefe directo).
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede ver esto.' }, { status: 403 });
  }

  const { data: trabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, estado')
    .eq('estado', 'activo')
    .order('nombre_completo');

  return NextResponse.json({ trabajadores: trabajadores || [] });
}

export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede administrar esto.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trabajadorId = body?.trabajador_id;
  if (!trabajadorId) {
    return NextResponse.json({ error: 'Falta indicar el trabajador.' }, { status: 400 });
  }

  const { error } = await admin
    .from('caja_chica_aprobadores_respaldo')
    .upsert({ trabajador_id: trabajadorId, agregado_por: user.id }, { onConflict: 'trabajador_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede administrar esto.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trabajadorId = body?.trabajador_id;
  if (!trabajadorId) {
    return NextResponse.json({ error: 'Falta indicar el trabajador.' }, { status: 400 });
  }

  await admin.from('caja_chica_aprobadores_respaldo').delete().eq('trabajador_id', trabajadorId);
  return NextResponse.json({ ok: true });
}
