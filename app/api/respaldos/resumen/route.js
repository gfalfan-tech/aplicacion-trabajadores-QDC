import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { obtenerDocumentosRespaldos } from '@/lib/respaldosServidor';

// Devuelve todo el árbol de Respaldos (permisos/vacaciones/caja chica/
// rendición de gastos ya cerrados), cada documento marcado con `nuevo`
// según la última vez que ESTE administrador entró a la carpeta — y de
// paso deja registrada esta visita como "la última", para que la próxima
// vez que entre el numerito ya esté en 0 y solo cuenten los que se
// cerraron después de ahora.
//
// Solo administrador (no alcanza con ser rrhh/jefatura) — a propósito
// distinto del resto del panel, por eso se valida acá con el rol crudo
// en vez de con auth.esRRHH.
export async function GET(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.roles.includes('administrador')) {
    return NextResponse.json({ error: 'Esta sección es solo para administradores.' }, { status: 403 });
  }

  const { data: yo } = await auth.admin
    .from('trabajadores')
    .select('respaldos_vista_en')
    .eq('id', auth.user.id)
    .maybeSingle();
  const vistaAnterior = yo?.respaldos_vista_en || null;
  const umbral = vistaAnterior ? new Date(vistaAnterior).getTime() : 0;

  const datos = await obtenerDocumentosRespaldos(auth.admin);

  const conNuevo = (lista) =>
    lista.map((item) => ({ ...item, nuevo: !!item.fecha && new Date(item.fecha).getTime() > umbral }));

  const ahora = new Date().toISOString();
  await auth.admin.from('trabajadores').update({ respaldos_vista_en: ahora }).eq('id', auth.user.id);

  return NextResponse.json({
    vistaAnterior,
    tipos: {
      permisos: conNuevo(datos.permisos),
      vacaciones: conNuevo(datos.vacaciones),
      cajaChica: conNuevo(datos.cajaChica),
      rendicionGastos: conNuevo(datos.rendicionGastos),
    },
  });
}
