import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enviarCorreo } from '@/lib/enviarCorreo';
import { correoRendicionNueva } from '@/lib/plantillasCorreo';

// Pasa una rendición de 'borrador' a 'pendiente' — recién ahí empieza a
// verla su jefe directo (o RR.HH./administrador si no tiene uno válido).
// Antes de esta ruta el trabajador arma la rendición directo contra
// Supabase (las políticas RLS ya restringen todo a "mientras es
// borrador y es mía"); esta transición sí pasa por el servidor porque
// hay que validar cosas que no dependen solo del dueño de la fila: que
// tenga al menos una línea cargada, y quién le corresponde revisarla.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const body = await req.json();
  const { rendicionId } = body;
  if (!rendicionId) {
    return NextResponse.json({ error: 'Falta el id de la rendición.' }, { status: 400 });
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' },
      { status: 500 }
    );
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Sesión inválida o expirada.' }, { status: 401 });
  }
  const callerId = userData.user.id;

  const { data: rendicion } = await admin
    .from('rendiciones_gastos')
    .select('id, trabajador_id, estado, moneda')
    .eq('id', rendicionId)
    .maybeSingle();
  if (!rendicion) {
    return NextResponse.json({ error: 'No se encontró esa rendición.' }, { status: 404 });
  }
  if (rendicion.trabajador_id !== callerId) {
    return NextResponse.json({ error: 'No tienes permiso sobre esta rendición.' }, { status: 403 });
  }
  if (rendicion.estado !== 'borrador') {
    return NextResponse.json({ error: 'Esta rendición ya fue enviada.' }, { status: 409 });
  }

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', callerId);
  const tieneAcceso = (rolesData || []).some((r) => r.rol === 'rendicion_gastos');
  if (!tieneAcceso) {
    return NextResponse.json(
      { error: 'No tienes acceso al módulo de Rendición de Gastos.' },
      { status: 403 }
    );
  }

  const { count: cantidadLineas } = await admin
    .from('rendicion_gastos_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('rendicion_id', rendicionId);
  if (!cantidadLineas) {
    return NextResponse.json(
      { error: 'Agrega al menos una línea de gasto antes de enviar la rendición.' },
      { status: 422 }
    );
  }

  const { error } = await admin
    .from('rendiciones_gastos')
    .update({ estado: 'pendiente', fecha_envio: new Date().toISOString() })
    .eq('id', rendicionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aviso in-app + correo con botones para quien le toca revisar primero
  // (su jefe directo, o RR.HH./administrador si no tiene uno con acceso
  // al sistema).
  const { data: trabajador } = await admin
    .from('trabajadores')
    .select('nombre_completo, jefe_directo_id')
    .eq('id', callerId)
    .maybeSingle();

  let idsAvisar = [];
  let etapaCorreo = 'finanzas';
  if (trabajador?.jefe_directo_id) {
    const { data: rolesJefe } = await admin
      .from('trabajador_roles')
      .select('rol')
      .eq('trabajador_id', trabajador.jefe_directo_id);
    const jefeValido = (rolesJefe || []).some((r) => ['jefatura', 'rrhh', 'administrador'].includes(r.rol));
    if (jefeValido) {
      idsAvisar = [trabajador.jefe_directo_id];
      etapaCorreo = 'jefe';
    }
  }
  if (idsAvisar.length === 0) {
    const { data: rolesRRHH } = await admin
      .from('trabajador_roles')
      .select('trabajador_id')
      .in('rol', ['rrhh', 'administrador']);
    idsAvisar = [...new Set((rolesRRHH || []).map((r) => r.trabajador_id))];
  }

  if (idsAvisar.length > 0) {
    await admin.from('notificaciones').insert(
      idsAvisar.map((id) => ({
        trabajador_id: id,
        titulo: 'Rendición de gastos',
        cuerpo: `${trabajador?.nombre_completo || 'Un trabajador'} envió una rendición de gastos para tu revisión.`,
        relacionado_tipo: 'rendicion_gastos',
        relacionado_id: rendicionId,
      }))
    );
  }

  // Correo con botones de aprobar/rechazar al revisor principal
  const idCorreoRevisor = idsAvisar[0];
  if (idCorreoRevisor) {
    const { data: revisor } = await admin
      .from('trabajadores')
      .select('id, email')
      .eq('id', idCorreoRevisor)
      .maybeSingle();
    if (revisor?.email) {
      const { data: tokenRevision } = await admin.rpc('generar_token_revision_rendicion_gastos', {
        p_rendicion_id: rendicionId,
        p_revisor_id: revisor.id,
        p_etapa: etapaCorreo,
      });
      if (tokenRevision) {
        const { data: lineas } = await admin
          .from('rendicion_gastos_lineas')
          .select('monto')
          .eq('rendicion_id', rendicionId);
        const totalGastos = (lineas || []).reduce((s, l) => s + Number(l.monto || 0), 0);

        const { subject, html } = correoRendicionNueva({
          nombreTrabajador: trabajador?.nombre_completo || 'Un trabajador',
          totalGastos,
          moneda: rendicion.moneda || 'CLP',
          etapa: etapaCorreo,
          token: tokenRevision,
        });
        enviarCorreo({ to: revisor.email, subject, html }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
