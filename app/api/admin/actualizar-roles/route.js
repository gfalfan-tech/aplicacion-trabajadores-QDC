import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

const ROLES_VALIDOS = ['trabajador', 'jefatura', 'rrhh', 'administrador', 'rendicion_gastos'];

// Reemplaza los roles de un trabajador (borra los que tenía y deja
// exactamente los que llegan en `roles`).
//
// Por qué existe esta ruta y no se hace directo desde el cliente:
// RR.HH. → Trabajadores → Editar hacía esto con dos llamadas seguidas del
// navegador (delete + insert) usando el token del propio usuario. Cuando
// RR.HH. editaba SU PROPIO perfil, el delete borraba (entre otras) su
// propia fila de rol "rrhh"/"administrador" — y como la política RLS de
// inserción vuelve a exigir que quien inserta TENGA ese rol en este mismo
// momento, el insert que venía justo después quedaba rechazado (o el resto
// del guardado se abortaba a mitad de camino). Resultado: la persona se
// quedaba sin ver ni siquiera su propio perfil de RR.HH., y en el listado
// de Trabajadores solo se veía a sí misma (la RLS de "trabajadores" ya no
// la reconocía como RR.HH.).
//
// Al mover el delete+insert acá, usamos la llave de servicio (que no está
// sujeta a RLS), así que da lo mismo si a mitad de camino la persona se
// queda momentáneamente sin roles — el permiso para llamar a esta ruta ya
// se validó una sola vez arriba, con el token de sesión vigente.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para editar roles.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trabajadorId = body?.trabajador_id;
  const roles = Array.isArray(body?.roles) ? body.roles.filter((r) => ROLES_VALIDOS.includes(r)) : [];

  if (!trabajadorId) {
    return NextResponse.json({ error: 'Falta el trabajador.' }, { status: 400 });
  }
  if (!roles.length) {
    return NextResponse.json(
      { error: 'Debe quedar al menos un rol marcado (normalmente "trabajador").' },
      { status: 400 }
    );
  }

  const { error: delError } = await auth.admin
    .from('trabajador_roles')
    .delete()
    .eq('trabajador_id', trabajadorId);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 400 });
  }

  const { error: insError } = await auth.admin
    .from('trabajador_roles')
    .insert(roles.map((rol) => ({ trabajador_id: trabajadorId, rol })));
  if (insError) {
    return NextResponse.json({ error: insError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
