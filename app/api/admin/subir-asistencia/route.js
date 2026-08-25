import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAsistenciaXls, normalizarRut } from '@/lib/asistenciaXls';

// Recibe el "Reporte de asistencia simplificado" que exporta el sistema de
// marcaje (un archivo .xls con una hoja por trabajador) y guarda, por
// trabajador y por período, los días de inasistencia y los minutos de
// atraso que ese mismo sistema ya calculó. Solo RR.HH./administrador puede
// usar esto.
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
    return NextResponse.json({ error: 'No tienes permiso para subir asistencia.' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let filas;
  try {
    filas = parseAsistenciaXls(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo leer el archivo. ¿Es el reporte de asistencia exportado por el sistema de marcaje? ' + err.message },
      { status: 400 }
    );
  }

  if (filas.length === 0) {
    return NextResponse.json(
      { error: 'El archivo no tiene ninguna hoja con el formato esperado.' },
      { status: 400 }
    );
  }

  const { data: trabajadores } = await admin.from('trabajadores').select('id, rut, nombre_completo');
  const porRut = new Map((trabajadores || []).map((t) => [normalizarRut(t.rut), t]));

  const actualizados = [];
  const noEncontrados = [];
  const sinDatos = [];

  for (const fila of filas) {
    if (!fila.ok) {
      sinDatos.push({ rut: fila.rut, hoja: fila.hoja, motivo: fila.motivo });
      continue;
    }

    const trabajador = porRut.get(normalizarRut(fila.rut));
    if (!trabajador) {
      noEncontrados.push({ rut: fila.rut, hoja: fila.hoja });
      continue;
    }

    const { error } = await admin.from('asistencia_mensual').upsert(
      {
        trabajador_id: trabajador.id,
        periodo_desde: fila.periodo_desde,
        periodo_hasta: fila.periodo_hasta,
        dias_inasistencia: fila.dias_inasistencia,
        atraso_minutos: fila.atraso_minutos,
        cantidad_atrasos: fila.cantidad_atrasos,
        salidas_anticipadas_cantidad: fila.salidas_anticipadas_cantidad,
        dias_licencia_medica: fila.dias_licencia_medica,
        subido_por: userData.user.id,
      },
      { onConflict: 'trabajador_id,periodo_desde,periodo_hasta' }
    );

    if (error) {
      noEncontrados.push({ rut: fila.rut, hoja: fila.hoja, error: error.message });
    } else {
      actualizados.push({
        nombre: trabajador.nombre_completo,
        rut: trabajador.rut,
        periodo_desde: fila.periodo_desde,
        periodo_hasta: fila.periodo_hasta,
        dias_inasistencia: fila.dias_inasistencia,
        atraso_minutos: fila.atraso_minutos,
      });
    }
  }

  return NextResponse.json({ ok: true, actualizados, noEncontrados, sinDatos });
}
