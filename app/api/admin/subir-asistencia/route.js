import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAsistenciaXls, normalizarRut } from '@/lib/asistenciaXls';
import { parseAsistenciaPdf } from '@/lib/asistenciaPdf';
import { armarMapaJustificaciones } from '@/lib/asistenciaJustificacion';

// Recibe el reporte de asistencia que exporta el sistema de marcaje en PDF
// (una página por trabajador — se aceptan tanto el "Reporte de asistencia y
// jornada" como el "Reporte de asistencia simplificado" anterior; también
// se acepta el formato .xls antiguo, con una hoja por trabajador, por si
// algún mes vuelve a venir así) y guarda, por trabajador y por período, los
// días de inasistencia y los minutos de atraso que ese mismo sistema ya
// calculó. Solo RR.HH./administrador puede usar esto.
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
  const nombreArchivo = (file.name || '').toLowerCase();
  const esPdf = nombreArchivo.endsWith('.pdf') || file.type === 'application/pdf';

  let filas;
  try {
    filas = esPdf ? await parseAsistenciaPdf(buffer) : parseAsistenciaXls(buffer);
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
      sinDatos.push({ rut: fila.rut, hoja: fila.nombre || fila.hoja, motivo: fila.motivo });
      continue;
    }

    const trabajador = porRut.get(normalizarRut(fila.rut));
    if (!trabajador) {
      noEncontrados.push({ rut: fila.rut, hoja: fila.nombre || fila.hoja });
      continue;
    }

    // Respaldo: si alguna de las fechas que parecen inasistencia cae dentro
    // de unas vacaciones o un permiso de día completo ya aprobados, o de una
    // licencia médica ya registrada por RR.HH., se descuenta de las
    // inasistencias del período — por si el sistema de marcaje no quedó
    // bien sincronizado. Nunca se descuenta más de lo que el propio archivo
    // reportó como inasistencias. Los permisos CON horario (entrada tardía o
    // salida anticipada) no se auto-descuentan acá — solo se muestran como
    // "posible justificación" al ver el detalle (ver
    // components/ModalDetalleAsistencia.js), porque no hay forma de cruzar
    // con certeza minutos de atraso contra un horario sin la hora real de
    // marcaje.
    let diasInasistencia = fila.dias_inasistencia;
    let fechasAjustadas = [];
    if (fila.fechas_inasistencia?.length && diasInasistencia > 0) {
      const [{ data: vacacionesAprobadas }, { data: permisosAprobados }, { data: licenciasMedicas }] =
        await Promise.all([
          admin
            .from('solicitudes_vacaciones')
            .select('fecha_desde, fecha_hasta')
            .eq('trabajador_id', trabajador.id)
            .eq('estado', 'aprobada')
            .lte('fecha_desde', fila.periodo_hasta)
            .gte('fecha_hasta', fila.periodo_desde),
          admin
            .from('solicitudes_permiso')
            .select('fecha_desde, fecha_hasta, hora_desde, hora_hasta')
            .eq('trabajador_id', trabajador.id)
            .eq('estado', 'aprobada')
            .lte('fecha_desde', fila.periodo_hasta)
            .gte('fecha_hasta', fila.periodo_desde),
          admin
            .from('licencias_medicas')
            .select('fecha_desde, fecha_hasta')
            .eq('trabajador_id', trabajador.id)
            .lte('fecha_desde', fila.periodo_hasta)
            .gte('fecha_hasta', fila.periodo_desde),
        ]);

      const justificaciones = armarMapaJustificaciones({
        vacaciones: vacacionesAprobadas,
        permisos: permisosAprobados,
        licencias: licenciasMedicas,
      });

      fechasAjustadas = fila.fechas_inasistencia.filter((f) => justificaciones.get(f)?.completo);
      if (fechasAjustadas.length) {
        diasInasistencia = Math.max(0, diasInasistencia - fechasAjustadas.length);
      }
    }

    // El detalle día por día que se guarda respeta el mismo ajuste por
    // vacaciones que el total: un día que dejó de contar como inasistencia
    // por caer en vacaciones aprobadas no se muestra como inasistencia en
    // el detalle (pero sí queda su atraso, si tuvo).
    const detalleDias = (fila.detalle_dias || []).map((d) =>
      fechasAjustadas.includes(d.fecha) ? { ...d, inasistencia: false } : d
    ).filter((d) => d.atraso_minutos > 0 || d.inasistencia);

    const { error } = await admin.from('asistencia_mensual').upsert(
      {
        trabajador_id: trabajador.id,
        periodo_desde: fila.periodo_desde,
        periodo_hasta: fila.periodo_hasta,
        dias_inasistencia: diasInasistencia,
        atraso_minutos: fila.atraso_minutos,
        cantidad_atrasos: fila.cantidad_atrasos,
        salidas_anticipadas_cantidad: fila.salidas_anticipadas_cantidad,
        dias_licencia_medica: fila.dias_licencia_medica,
        detalle_dias: detalleDias,
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
        dias_inasistencia: diasInasistencia,
        dias_inasistencia_original: fila.dias_inasistencia,
        fechas_ajustadas_por_vacaciones: fechasAjustadas,
        atraso_minutos: fila.atraso_minutos,
      });
    }
  }

  return NextResponse.json({ ok: true, actualizados, noEncontrados, sinDatos });
}
