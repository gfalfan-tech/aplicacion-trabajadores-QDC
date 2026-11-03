import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { obtenerDocumentosRespaldos } from '@/lib/respaldosServidor';

// Permisos y vacaciones APROBADOS (con todo lo que necesita el PDF de la
// papeleta), cada uno con su marca de formalizada. Para la pantalla
// "Papeletas por formalizar" — RR.HH./administrador o rol
// 'formalizar_papeletas'.
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.puedeFormalizar) {
    return NextResponse.json({ error: 'No tienes acceso a las papeletas.' }, { status: 403 });
  }

  const datos = await obtenerDocumentosRespaldos(auth.admin, { soloPermisosVacaciones: true });
  return NextResponse.json({ permisos: datos.permisos, vacaciones: datos.vacaciones });
}
