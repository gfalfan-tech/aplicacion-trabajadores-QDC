import { NextResponse } from 'next/server';
import { autenticar } from '@/lib/apiAuth';
import { calcularTotales } from '@/lib/cajaChicaLogica';

const ESTADOS_TERMINALES = ['rendida', 'rechazada'];

// "Aprobar la rendición de la caja": RR.HH./administrador revisa el
// resumen del folio abierto y registra el efectivo contado en la caja y
// el monto a reintegrar. Desde ese momento no se aceptan solicitudes
// nuevas en este folio. Se puede volver a llamar para corregir los montos
// mientras el folio siga abierto (no se ha registrado la recarga).
export async function POST(req) {
  let auth;
  try {
    auth = await autenticar(req);
  } catch (e) {
    return NextResponse.json({ error: e.error }, { status: e.status });
  }
  const { admin, user, esRRHH } = auth;
  if (!esRRHH) {
    return NextResponse.json({ error: 'Solo RR.HH./administrador puede aprobar la rendición de la caja.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const efectivoContado = Math.round(Number(body?.efectivo_contado));
  const montoReintegro = Math.round(Number(body?.monto_reintegro));
  const observacion = (body?.observacion || '').trim() || null;

  if (!Number.isFinite(efectivoContado) || efectivoContado < 0 || body?.efectivo_contado === '' || body?.efectivo_contado == null) {
    return NextResponse.json({ error: 'Ingresa el efectivo contado en la caja (puede ser 0).' }, { status: 400 });
  }
  if (!montoReintegro || montoReintegro <= 0) {
    return NextResponse.json({ error: 'Ingresa el monto a reintegrar (mayor a 0).' }, { status: 400 });
  }

  const { data: periodo } = await admin
    .from('caja_chica_periodos')
    .select('*')
    .is('fecha_cierre', null)
    .maybeSingle();
  if (!periodo) {
    return NextResponse.json({ error: 'No hay una caja chica abierta.' }, { status: 400 });
  }

  const { data: solicitudes } = await admin
    .from('caja_chica_solicitudes')
    .select('*')
    .eq('periodo_id', periodo.id);

  const noTerminales = (solicitudes || []).filter((s) => !ESTADOS_TERMINALES.includes(s.estado));
  if (noTerminales.length > 0) {
    return NextResponse.json(
      {
        error: `Hay ${noTerminales.length} solicitud(es) todavía en curso (sin rendir). Complétalas antes de aprobar la rendición de la caja.`,
      },
      { status: 400 }
    );
  }

  const { disponible } = calcularTotales(periodo, solicitudes || []);
  const diferencia = efectivoContado - disponible;
  if (diferencia !== 0 && !observacion) {
    return NextResponse.json(
      { error: 'El efectivo contado no coincide con el saldo teórico. Escribe una observación que explique la diferencia.' },
      { status: 400 }
    );
  }

  const folioTexto = String(periodo.folio || 0).padStart(4, '0');
  const codigo =
    periodo.codigo_verificacion ||
    `CC-${folioTexto}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  const { error } = await admin
    .from('caja_chica_periodos')
    .update({
      rendicion_aprobada_at: new Date().toISOString(),
      rendicion_aprobada_por: user.id,
      efectivo_contado: efectivoContado,
      diferencia_cuadratura: diferencia,
      observacion_cuadratura: diferencia !== 0 ? observacion : null,
      monto_reintegro: montoReintegro,
      codigo_verificacion: codigo,
    })
    .eq('id', periodo.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, saldo_teorico: disponible, diferencia, codigo_verificacion: codigo });
}
