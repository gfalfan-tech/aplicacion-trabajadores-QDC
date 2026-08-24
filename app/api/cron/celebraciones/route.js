import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { nombreCorto } from '@/lib/nombreCorto';
import { configurarFuentes } from '@/lib/tarjetas/fontSetup';
import { construirTemasCumpleanos } from '@/lib/tarjetas/temasCumpleanos';
import { construirSvgCumpleanos } from '@/lib/tarjetas/tarjetaCumpleanos';
import { construirSvgAniversario } from '@/lib/tarjetas/tarjetaAniversario';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_PUBLICADOR = 'gfalfan@qdc.cl';

// Fecha "de hoy" en horario de Chile (no en UTC) — importante porque el
// cron corre en UTC y cerca de medianoche el día en UTC y en Chile pueden
// no coincidir.
function hoyChile() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-');
  return { anio: Number(partes[0]), mes: Number(partes[1]), dia: Number(partes[2]) };
}

function mesDia(fechaISO) {
  if (!fechaISO) return null;
  const [, mes, dia] = fechaISO.split('-').map(Number);
  return { mes, dia };
}

async function subirImagen(admin, buffer, nombreArchivo) {
  const { error } = await admin.storage.from('mural').upload(nombreArchivo, buffer, {
    contentType: 'image/png',
    upsert: false,
  });
  if (error) throw new Error(`Error subiendo imagen a Storage: ${error.message}`);
  const { data } = admin.storage.from('mural').getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

export async function GET(req) {
  // Protección opcional: si se configura CRON_SECRET en Vercel, solo se
  // acepta la llamada que trae ese secreto (así lo llama Vercel Cron
  // automáticamente). Si no está configurado, igual se ejecuta — el peor
  // caso de no protegerlo es que alguien dispare la publicación un poco
  // antes, no un riesgo de datos.
  const secreto = process.env.CRON_SECRET;
  if (secreto) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
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

  configurarFuentes();

  const { anio: anioActual, mes: mesHoy, dia: diaHoy } = hoyChile();
  // La publicación debe durar solo el día de la celebración: se guarda como
  // fecha de expiración el propio día de hoy, porque el mural muestra un
  // post mientras fecha_expiracion >= hoy y deja de mostrarlo al día
  // siguiente (ver app/trabajador/mural/page.js y app/trabajador/page.js).
  const fechaExpiracionISO = `${anioActual}-${String(mesHoy).padStart(2, '0')}-${String(diaHoy).padStart(2, '0')}`;

  const { data: publicador } = await admin
    .from('trabajadores')
    .select('id')
    .eq('email', EMAIL_PUBLICADOR)
    .maybeSingle();
  const publicadoPor = publicador?.id;
  if (!publicadoPor) {
    return NextResponse.json(
      { error: `No se encontró un trabajador con email ${EMAIL_PUBLICADOR} para usar como autor de las publicaciones.` },
      { status: 500 }
    );
  }

  const { data: trabajadores, error: errorTrabajadores } = await admin
    .from('trabajadores')
    .select('id, nombre_completo, fecha_nacimiento, fecha_ingreso, estado')
    .eq('estado', 'activo');
  if (errorTrabajadores) {
    return NextResponse.json({ error: errorTrabajadores.message }, { status: 500 });
  }

  const logoBase64 = Buffer.from(
    await fetch(new URL('/qdc-logo.png', req.url)).then((r) => r.arrayBuffer())
  ).toString('base64');

  const temas = construirTemasCumpleanos();
  const resultado = { cumpleanos: [], aniversarios: [], errores: [] };

  // Cuántos cumpleaños automáticos van publicados hasta ahora, para saber
  // qué plantilla (1-20) sigue en la rotación. Se incrementa localmente
  // por cada uno nuevo que se publique en esta misma corrida.
  const { count: totalCumpleanosPrevios } = await admin
    .from('mural_auto_publicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'cumpleanos');
  let contadorPlantilla = totalCumpleanosPrevios || 0;

  for (const t of trabajadores || []) {
    // --- Cumpleaños ---
    const cumple = mesDia(t.fecha_nacimiento);
    if (cumple && cumple.mes === mesHoy && cumple.dia === diaHoy) {
      try {
        const nombre = nombreCorto(t.nombre_completo);
        const indicePlantilla = (contadorPlantilla % 20) + 1;
        const tema = temas[indicePlantilla - 1];
        const svg = construirSvgCumpleanos(tema, nombre, logoBase64);
        const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
        const nombreArchivo = `auto_cumpleanos_${t.id}_${anioActual}_${Date.now()}.png`;
        const imagenUrl = await subirImagen(admin, buffer, nombreArchivo);

        const { data: publicacion, error: errorPub } = await admin
          .from('publicaciones_mural')
          .insert({
            titulo: `¡Feliz cumpleaños, ${nombre}!`,
            contenido: 'Los colaboradores de QDC te desean un muy lindo día. ¡Felicidades!',
            tipo: 'imagen',
            imagen_url: imagenUrl,
            fecha_expiracion: fechaExpiracionISO,
            publicado_por: publicadoPor,
          })
          .select()
          .single();
        if (errorPub) throw new Error(errorPub.message);

        const { error: errorTracking } = await admin.from('mural_auto_publicaciones').insert({
          trabajador_id: t.id,
          tipo: 'cumpleanos',
          anio: anioActual,
          plantilla: indicePlantilla,
          publicacion_id: publicacion.id,
        });
        if (errorTracking) {
          if (errorTracking.code === '23505') {
            // Ya se había publicado este año (carrera con otra corrida) —
            // se ignora, no es un error real.
          } else {
            throw new Error(errorTracking.message);
          }
        } else {
          contadorPlantilla++;
          resultado.cumpleanos.push({ trabajador: nombre, plantilla: indicePlantilla });
        }
      } catch (e) {
        resultado.errores.push({ trabajador: t.nombre_completo, tipo: 'cumpleanos', error: e.message });
      }
    }

    // --- Aniversario ---
    const ingreso = mesDia(t.fecha_ingreso);
    if (ingreso && ingreso.mes === mesHoy && ingreso.dia === diaHoy) {
      const anioIngreso = Number(String(t.fecha_ingreso).slice(0, 4));
      const anios = anioActual - anioIngreso;
      if (anios >= 1) {
        try {
          const nombre = nombreCorto(t.nombre_completo);
          const svg = construirSvgAniversario(nombre, anios, logoBase64);
          const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
          const nombreArchivo = `auto_aniversario_${t.id}_${anioActual}_${Date.now()}.png`;
          const imagenUrl = await subirImagen(admin, buffer, nombreArchivo);

          const { data: publicacion, error: errorPub } = await admin
            .from('publicaciones_mural')
            .insert({
              titulo: `¡Feliz aniversario, ${nombre}!`,
              contenido: `Hoy celebra ${anios} ${anios === 1 ? 'año' : 'años'} como parte del equipo QDC. ¡Gracias por tu compromiso y dedicación!`,
              tipo: 'imagen',
              imagen_url: imagenUrl,
              fecha_expiracion: fechaExpiracionISO,
              publicado_por: publicadoPor,
            })
            .select()
            .single();
          if (errorPub) throw new Error(errorPub.message);

          const { error: errorTracking } = await admin.from('mural_auto_publicaciones').insert({
            trabajador_id: t.id,
            tipo: 'aniversario',
            anio: anioActual,
            plantilla: null,
            publicacion_id: publicacion.id,
          });
          if (errorTracking && errorTracking.code !== '23505') {
            throw new Error(errorTracking.message);
          }
          if (!errorTracking) {
            resultado.aniversarios.push({ trabajador: nombre, anios });
          }
        } catch (e) {
          resultado.errores.push({ trabajador: t.nombre_completo, tipo: 'aniversario', error: e.message });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, fecha: `${anioActual}-${mesHoy}-${diaHoy}`, ...resultado });
}
