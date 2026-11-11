import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';

// Administra los "aprobadores adicionales por trabajador": personas que,
// además del jefe directo, pueden aprobar las solicitudes de Caja Chica de
// un trabajador específico. Solo RR.HH./administrador.
async function autorizarRRHH(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return { respuesta: NextResponse.json({ error: e.error }, { status: e.status }) };
  }
  if (!auth.esRRHH) {
    return {
      respuesta: NextResponse.json(
        { error: 'Solo RR.HH./administrador puede administrar esto.' },
        { status: 403 }
      ),
    };
  }
  return { auth };
}

export async function POST(req) {
  const { auth, respuesta } = await autorizarRRHH(req);
  if (respuesta) return respuesta;
  const { admin, user } = auth;

  const body = await req.json().catch(() => ({}));
  const { solicitante_id: solicitanteId, aprobador_id: aprobadorId } = body || {};
  if (!solicitanteId || !aprobadorId) {
    return NextResponse.json({ error: 'Falta indicar el trabajador y el aprobador.' }, { status: 400 });
  }
  if (solicitanteId === aprobadorId) {
    return NextResponse.json({ error: 'El aprobador no puede ser el mismo trabajador.' }, { status: 400 });
  }

  const { error } = await admin
    .from('caja_chica_aprobadores_adicionales')
    .upsert(
      { solicitante_id: solicitanteId, aprobador_id: aprobadorId, agregado_por: user.id },
      { onConflict: 'solicitante_id,aprobador_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { auth, respuesta } = await autorizarRRHH(req);
  if (respuesta) return respuesta;
  const { admin } = auth;

  const body = await req.json().catch(() => ({}));
  const { solicitante_id: solicitanteId, aprobador_id: aprobadorId } = body || {};
  if (!solicitanteId || !aprobadorId) {
    return NextResponse.json({ error: 'Falta indicar el trabajador y el aprobador.' }, { status: 400 });
  }

  const { error } = await admin
    .from('caja_chica_aprobadores_adicionales')
    .delete()
    .eq('solicitante_id', solicitanteId)
    .eq('aprobador_id', aprobadorId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
