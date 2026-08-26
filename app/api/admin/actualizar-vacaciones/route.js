import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Registra un nuevo corte de saldo de vacaciones para un trabajador ya
// existente (RR.HH. lo usa para "poner al día" manualmente los días
// pendientes y los progresivos). Usa la service role porque
// vacaciones_saldo_inicial no tiene una policy de insert para RR.HH. desde
// el cliente (mismo patrón que /api/admin/create-trabajador).
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
  const { error } = await admin.from('vacaciones_saldo_inicial').insert({
    trabajador_id: body.trabajador_id,
    fecha_corte: ahora.toISOString().slice(0, 10),
    // creado_en (fecha Y hora exacta) es lo que usa v_vacaciones_saldo para
    // desempatar cuando hay más de una edición el mismo día — sin esto, la
    // vista puede quedarse mostrando una edición anterior del mismo día en
    // vez de la que se acaba de guardar.
    creado_en: ahora.toISOString(),
    dias_pendientes_base: body.dias_pendientes_base || 0,
    dias_progresivos_reconocidos: body.dias_progresivos_reconocidos || 0,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
