import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseVacacionesSaldoXls } from '@/lib/vacacionesSaldoXls';
import { normalizarRut } from '@/lib/asistenciaXls';

// Recibe el informe manual "VACACIONES DEL PERSONAL" (una fila por
// trabajador, con RUT, días progresivos reconocidos y saldo total a la
// fecha del informe) y "pone al día" en bloque el saldo inicial de cada
// trabajador que calce por RUT — mismo upsert que ya hace, uno por uno,
// /api/admin/actualizar-vacaciones (tabla vacaciones_saldo_inicial), pero
// para toda la planilla de una vez.
//
// La fecha de corte que queda registrada es HOY (el día en que se sube
// el archivo), no una fecha que traiga el informe — es el día en que
// este saldo queda confirmado como vigente en el sistema, y desde el
// cual la app sigue acumulando días automáticamente hacia adelante.
// Solo RR.HH./administrador puede usar esto.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
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

  const { data: rolesData } = await admin
    .from('trabajador_roles')
    .select('rol')
    .eq('trabajador_id', userData.user.id);
  const esRRHH = (rolesData || []).some((r) => r.rol === 'rrhh' || r.rol === 'administrador');
  if (!esRRHH) {
    return NextResponse.json(
      { error: 'No tienes permiso para cargar saldos de vacaciones.' },
      { status: 403 }
    );
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parseo;
  try {
    parseo = parseVacacionesSaldoXls(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          'No se pudo leer el archivo. ¿Es el informe "VACACIONES DEL PERSONAL" con columna RUT? ' +
          err.message,
      },
      { status: 400 }
    );
  }

  if (!parseo.ok) {
    return NextResponse.json({ error: parseo.motivo }, { status: 400 });
  }
  if (parseo.filas.length === 0) {
    return NextResponse.json({ error: 'El archivo no trae ninguna fila de trabajador.' }, { status: 400 });
  }

  const { data: trabajadores } = await admin.from('trabajadores').select('id, rut, nombre_completo');
  const porRut = new Map((trabajadores || []).map((t) => [normalizarRut(t.rut), t]));

  const ahora = new Date();
  const fechaCorte = ahora.toISOString().slice(0, 10);

  const actualizados = [];
  const noEncontrados = [];

  for (const fila of parseo.filas) {
    const trabajador = porRut.get(fila.rut_normalizado);
    if (!trabajador) {
      noEncontrados.push({ rut: fila.rut, nombre: fila.nombre });
      continue;
    }

    const { error } = await admin.from('vacaciones_saldo_inicial').upsert(
      {
        trabajador_id: trabajador.id,
        fecha_corte: fechaCorte,
        creado_en: ahora.toISOString(),
        dias_pendientes_base: fila.dias_pendientes_base,
        dias_progresivos_reconocidos: fila.dias_progresivos_reconocidos,
        proximo_dia_progresivo_fecha: fila.proximo_dia_progresivo_fecha,
      },
      { onConflict: 'trabajador_id' }
    );

    if (error) {
      noEncontrados.push({ rut: fila.rut, nombre: fila.nombre, error: error.message });
    } else {
      actualizados.push({
        rut: trabajador.rut,
        nombre: trabajador.nombre_completo,
        dias_pendientes_base: fila.dias_pendientes_base,
        dias_progresivos_reconocidos: fila.dias_progresivos_reconocidos,
      });
    }
  }

  return NextResponse.json({ ok: true, actualizados, noEncontrados, fecha_corte: fechaCorte });
}
