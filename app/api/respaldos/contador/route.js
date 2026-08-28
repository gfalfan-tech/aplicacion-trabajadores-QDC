import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { obtenerDocumentosRespaldos } from '@/lib/respaldosServidor';

// Versión liviana de /api/respaldos/resumen: solo el número de documentos
// nuevos, para el numerito sobre el ícono "Respaldos" del menú — esta SÍ
// se llama en cada página que carga AppShell, así que a propósito NO
// actualiza "última visita" (eso solo pasa al entrar de verdad a la
// carpeta, en /api/respaldos/resumen).
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.roles.includes('administrador')) {
    return NextResponse.json({ nuevos: 0 });
  }

  const { data: yo } = await auth.admin
    .from('trabajadores')
    .select('respaldos_vista_en')
    .eq('id', auth.user.id)
    .maybeSingle();
  const umbral = yo?.respaldos_vista_en ? new Date(yo.respaldos_vista_en).getTime() : 0;

  const datos = await obtenerDocumentosRespaldos(auth.admin);
  const todos = [...datos.permisos, ...datos.vacaciones, ...datos.cajaChica, ...datos.rendicionGastos];
  const nuevos = todos.filter((item) => item.fecha && new Date(item.fecha).getTime() > umbral).length;

  return NextResponse.json({ nuevos });
}
