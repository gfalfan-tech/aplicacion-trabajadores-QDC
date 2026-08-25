import { supabase } from '@/lib/supabaseClient';

// Diferencia en minutos entre dos horas "HH:MM:SS".
function minutosEntre(horaDesde, horaHasta) {
  const [h1, m1] = horaDesde.split(':').map(Number);
  const [h2, m2] = horaHasta.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

// Cantidad de días de calendario en que se traslapan dos rangos de fechas
// (ambos extremos incluidos). Se usa para prorratear cuántos días de un
// permiso caen dentro del período elegido para el informe.
function diasTraslape(desde1, hasta1, desde2, hasta2) {
  const inicio = desde1 > desde2 ? desde1 : desde2;
  const fin = hasta1 < hasta2 ? hasta1 : hasta2;
  if (inicio > fin) return 0;
  const [a1, m1, d1] = inicio.split('-').map(Number);
  const [a2, m2, d2] = fin.split('-').map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86400000) + 1;
}

// ¿El mes/día de una fecha (cumpleaños, aniversario) cae dentro del rango
// [desde, hasta], sin importar el año? Prueba con el año de "desde" y el de
// "hasta" por si el rango cruza el 31 de diciembre.
function mesDiaEnRango(mes, dia, desdeISO, hastaISO) {
  const anioDesde = Number(desdeISO.slice(0, 4));
  const anioHasta = Number(hastaISO.slice(0, 4));
  const mesDia = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  for (const anio of new Set([anioDesde, anioHasta])) {
    const candidata = `${anio}-${mesDia}`;
    if (candidata >= desdeISO && candidata <= hastaISO) return true;
  }
  return false;
}

/**
 * Junta todos los datos del "Informe RR.HH." para un rango de fechas
 * [desde, hasta] (YYYY-MM-DD, ambos incluidos): permisos, atrasos e
 * inasistencias, vacaciones, certificados de antigüedad, interacciones del
 * mural, ingresos, y cumpleaños/aniversarios del período. Los trabajadores
 * actualmente inactivos se listan aparte porque no se guarda la fecha en
 * que quedaron inactivos.
 */
export async function generarInformeRRHH(desde, hasta) {
  const [
    { data: trabajadores },
    { data: permisos },
    { data: vacaciones },
    { data: certificados },
    { data: asistencia },
    { data: publicaciones },
  ] = await Promise.all([
    supabase
      .from('trabajadores')
      .select('id, nombre_completo, rut, cargo, estado, fecha_ingreso, fecha_nacimiento, areas(nombre)')
      .order('nombre_completo'),
    supabase
      .from('solicitudes_permiso')
      .select('trabajador_id, fecha_desde, fecha_hasta, hora_desde, hora_hasta, estado')
      .eq('estado', 'aprobada')
      .lte('fecha_desde', hasta)
      .gte('fecha_hasta', desde),
    supabase
      .from('solicitudes_vacaciones')
      .select('trabajador_id, fecha_desde, fecha_hasta, dias_habiles, estado')
      .eq('estado', 'aprobada')
      .lte('fecha_desde', hasta)
      .gte('fecha_hasta', desde),
    supabase
      .from('certificados_antiguedad')
      .select('trabajador_id, requested_at')
      .gte('requested_at', `${desde}T00:00:00`)
      .lte('requested_at', `${hasta}T23:59:59`),
    supabase
      .from('asistencia_mensual')
      .select('trabajador_id, periodo_desde, periodo_hasta, atraso_minutos, dias_inasistencia')
      .lte('periodo_desde', hasta)
      .gte('periodo_hasta', desde),
    supabase
      .from('publicaciones_mural')
      .select('id, titulo, publicado_en')
      .gte('publicado_en', `${desde}T00:00:00`)
      .lte('publicado_en', `${hasta}T23:59:59`)
      .order('publicado_en'),
  ]);

  const idsPublicaciones = (publicaciones || []).map((p) => p.id);
  let reacciones = [];
  let comentarios = [];
  if (idsPublicaciones.length) {
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('mural_reacciones').select('publicacion_id').in('publicacion_id', idsPublicaciones),
      supabase.from('mural_comentarios').select('publicacion_id').in('publicacion_id', idsPublicaciones),
    ]);
    reacciones = r || [];
    comentarios = c || [];
  }

  // --- Agregación por trabajador -----------------------------------
  const porTrabajador = new Map();
  function fila(id) {
    if (!porTrabajador.has(id)) {
      porTrabajador.set(id, {
        permisosCantidad: 0,
        permisosMinutos: 0,
        permisosDiasCompletos: 0,
        vacacionesCantidad: 0,
        vacacionesDiasHabiles: 0,
        certificadosCantidad: 0,
        atrasoMinutos: 0,
        inasistenciaDias: 0,
        periodosAsistencia: [],
      });
    }
    return porTrabajador.get(id);
  }

  for (const p of permisos || []) {
    const f = fila(p.trabajador_id);
    f.permisosCantidad += 1;
    if (p.hora_desde && p.hora_hasta && p.fecha_desde === p.fecha_hasta) {
      f.permisosMinutos += minutosEntre(p.hora_desde, p.hora_hasta);
    } else {
      f.permisosDiasCompletos += diasTraslape(p.fecha_desde, p.fecha_hasta, desde, hasta);
    }
  }

  for (const v of vacaciones || []) {
    const f = fila(v.trabajador_id);
    f.vacacionesCantidad += 1;
    f.vacacionesDiasHabiles += v.dias_habiles || 0;
  }

  for (const c of certificados || []) {
    const f = fila(c.trabajador_id);
    f.certificadosCantidad += 1;
  }

  for (const a of asistencia || []) {
    const f = fila(a.trabajador_id);
    f.atrasoMinutos += a.atraso_minutos || 0;
    f.inasistenciaDias += a.dias_inasistencia || 0;
    f.periodosAsistencia.push(`${a.periodo_desde} → ${a.periodo_hasta}`);
  }

  const filasTrabajadores = (trabajadores || [])
    .map((t) => ({
      trabajador: t,
      ...(porTrabajador.get(t.id) || {
        permisosCantidad: 0,
        permisosMinutos: 0,
        permisosDiasCompletos: 0,
        vacacionesCantidad: 0,
        vacacionesDiasHabiles: 0,
        certificadosCantidad: 0,
        atrasoMinutos: 0,
        inasistenciaDias: 0,
        periodosAsistencia: [],
      }),
    }))
    // Solo se muestran filas con algún movimiento en el período, para no
    // llenar el informe de trabajadores sin nada que reportar.
    .filter(
      (r) =>
        r.permisosCantidad ||
        r.vacacionesCantidad ||
        r.certificadosCantidad ||
        r.atrasoMinutos ||
        r.inasistenciaDias
    );

  // --- Mural ---------------------------------------------------------
  const conteoReacciones = new Map();
  for (const r of reacciones) conteoReacciones.set(r.publicacion_id, (conteoReacciones.get(r.publicacion_id) || 0) + 1);
  const conteoComentarios = new Map();
  for (const c of comentarios) conteoComentarios.set(c.publicacion_id, (conteoComentarios.get(c.publicacion_id) || 0) + 1);

  const filasMural = (publicaciones || []).map((p) => ({
    ...p,
    reacciones: conteoReacciones.get(p.id) || 0,
    comentarios: conteoComentarios.get(p.id) || 0,
  }));

  // --- Ingresos / salidas / cumpleaños --------------------------------
  const ingresos = (trabajadores || []).filter(
    (t) => t.fecha_ingreso && t.fecha_ingreso >= desde && t.fecha_ingreso <= hasta
  );
  const inactivosActuales = (trabajadores || []).filter((t) => t.estado === 'inactivo');

  const cumpleanosAniversarios = (trabajadores || [])
    .filter((t) => t.estado !== 'inactivo')
    .flatMap((t) => {
      const eventos = [];
      if (t.fecha_nacimiento) {
        const [, mes, dia] = t.fecha_nacimiento.split('-').map(Number);
        if (mesDiaEnRango(mes, dia, desde, hasta)) {
          eventos.push({ trabajador: t, tipo: 'cumpleaños', mesDia: `${dia}/${mes}` });
        }
      }
      if (t.fecha_ingreso) {
        const [, mes, dia] = t.fecha_ingreso.split('-').map(Number);
        if (mesDiaEnRango(mes, dia, desde, hasta)) {
          eventos.push({ trabajador: t, tipo: 'aniversario laboral', mesDia: `${dia}/${mes}` });
        }
      }
      return eventos;
    });

  return {
    desde,
    hasta,
    filasTrabajadores,
    filasMural,
    ingresos,
    inactivosActuales,
    cumpleanosAniversarios,
  };
}
