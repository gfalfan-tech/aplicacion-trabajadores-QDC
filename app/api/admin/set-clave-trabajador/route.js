import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// RR.HH./administrador le asigna manualmente una clave a un trabajador
// (por ejemplo si nunca recibió/perdió su invitación por correo, o no
// tiene acceso a su correo). Esto cambia directamente la contraseña de
// su cuenta — no queda registrada en ninguna parte, solo la ve RR.HH.
// en pantalla al momento de escribirla para poder entregársela.
//
// Importante: si el trabajador cambia su propia clave después (desde su
// perfil), la que asignó RR.HH. deja de servir — la última que se haya
// definido, por cualquiera de los dos caminos, es la que queda activa.
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  if (!auth.esRRHH) {
    return NextResponse.json({ error: 'No tienes permiso para asignar claves.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trabajadorId = body?.trabajador_id;
  const clave = body?.clave || '';

  if (!trabajadorId) {
    return NextResponse.json({ error: 'Falta el trabajador.' }, { status: 400 });
  }
  if (clave.length < 6) {
    return NextResponse.json({ error: 'La clave debe tener al menos 6 caracteres.' }, { status: 400 });
  }

  // email_confirm: true es clave acá — como RR.HH. está asignando la clave
  // directamente (sin pasar por el link de invitación por correo, que es
  // lo que normalmente confirma la cuenta), si no confirmamos el correo en
  // este mismo paso el trabajador queda con clave pero sin poder entrar
  // ("Email not confirmed"). RR.HH. asignando la clave a mano es garantía
  // suficiente de que la cuenta es legítima.
  const { error } = await auth.admin.auth.admin.updateUserById(trabajadorId, {
    password: clave,
    email_confirm: true,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Marca clave_definida = true: esta clave la asignó RR.HH. directamente
  // (no viene de la invitación por correo), así que al trabajador NO se le
  // debe pedir pasar por "Crea tu contraseña" — entra directo a su perfil
  // con la clave que le entregó RR.HH.
  const { error: errorFlag } = await auth.admin
    .from('trabajadores')
    .update({ clave_definida: true })
    .eq('id', trabajadorId);
  if (errorFlag) {
    return NextResponse.json({ error: 'La clave se asignó, pero hubo un error: ' + errorFlag.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
