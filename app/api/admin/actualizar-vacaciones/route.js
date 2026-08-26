import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Registra el corte de saldo de vacaciones "al día" para un trabajador ya
// existente (RR.HH. lo usa para "poner al día" manualmente los días
// pendientes y los progresivos). Usa la service role porque
// vacaciones_saldo_inicial no tiene una policy de insert para RR.HH. desde
// el cliente (mismo patrón que /api/admin/create-trabajador).
//
// Importante: vacaciones_saldo_inicial tiene trabajador_id como llave
// primaria — es decir, UNA sola fila por trabajador, no un historial. Un
// insert() plano funciona la primera vez (cuando se crea el trabajador)
// pero en cualquier edición posterior choca con esa fila que ya existe y
// Postgres lo rechaza con "duplicate key value violates unique constraint
// vacaciones_saldo_inicial_pkey" — por eso las ediciones nunca se estaban
// guardando. upsert() reemplaza la fila si ya existe, o la crea si no.
export async function POST(req) {
  const body = await req.json();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kcxskzmmyjlamfambnhm.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      {
        error:
          'Falta configurar la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel (Project Settings → Environment Variables).',
      },
      { status: 500 }
    );
  }

  if (!body.trabajador_id) {
    return NextResponse.json({ error: 'Falta trabajador_id.' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const ahora = new Date();
  const { error } = await admin.from('vacaciones_saldo_inicial').upsert(
    {
      trabajador_id: body.trabajador_id,
      fecha_corte: ahora.toISOString().slice(0, 10),
      // creado_en (fecha y hora exacta) queda igual guardado por si algo
      // más lo usa para ordenar, aunque con upsert por trabajador_id ya no
      // puede haber más de una fila por trabajador.
      creado_en: ahora.toISOString(),
      dias_pendientes_base: body.dias_pendientes_base || 0,
      dias_progresivos_reconocidos: body.dias_progresivos_reconocidos || 0,
    },
    { onConflict: 'trabajador_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
