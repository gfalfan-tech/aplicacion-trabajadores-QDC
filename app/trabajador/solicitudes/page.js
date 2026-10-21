'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import AppShell from '@/components/AppShell';
import { trabajadorLinks } from '@/lib/navLinks';
import { verPdfPermiso, descargarPdfPermiso } from '@/lib/solicitudPdf';
import {
  cumpleEnAnio,
  hoyISO,
  anioObjetivo,
  rangoFeriados,
  opcionesCumple,
  etiquetaFecha,
} from '@/lib/cumpleanos';

const MOTIVO_CUMPLE = 'Beneficio día de cumpleaños';

const estadoStyle = {
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
  cancelada: 'bg-slate-100 text-slate-600',
};

function formatFecha(fechaISO) {
  // Evita el corrimiento de un día por zona horaria al parsear "YYYY-MM-DD".
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatHora(horaHHMMSS) {
  return horaHHMMSS ? horaHHMMSS.slice(0, 5) : '';
}

function fraseSolicitud(s, perfil) {
  const dias =
    s.fecha_desde === s.fecha_hasta
      ? `el día ${formatFecha(s.fecha_desde)}`
      : `desde el ${formatFecha(s.fecha_desde)} hasta el ${formatFecha(s.fecha_hasta)}`;

  const horas =
    s.hora_desde && s.hora_hasta
      ? ` entre las ${formatHora(s.hora_desde)} y las ${formatHora(s.hora_hasta)} horas`
      : '';

  const motivo = (s.motivo && s.motivo.trim()) || s.tipos_permiso?.nombre || 'motivo no especificado';

  return `Yo, ${perfil.nombre_completo}, RUT ${perfil.rut}, solicito permiso ${dias}${horas} por "${motivo}".`;
}

export default function Solicitudes() {
  const { perfil } = useAuth();
  const [tipos, setTipos] = useState([]);
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({
    tipo_permiso_id: '',
    fecha_desde: '',
    fecha_hasta: '',
    hora_desde: '',
    hora_hasta: '',
    motivo: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cumple, setCumple] = useState(null); // { cumpleISO, opciones } | { error }

  const tipoSel = tipos.find((t) => String(t.id) === String(form.tipo_permiso_id));
  const esCumple = !!tipoSel?.es_cumpleanos;
  const hoy = hoyISO();
  // Si el cumpleaños de este año ya pasó, se pide el del año siguiente.
  const anioCumple = perfil?.fecha_nacimiento
    ? anioObjetivo(perfil.fecha_nacimiento, hoy)
    : new Date().getFullYear();
  const yaTieneCumple = lista.some(
    (s) => s.anio_beneficio === anioCumple && ['pendiente', 'aprobada'].includes(s.estado)
  );

  async function cargar() {
    const { data: t } = await supabase.from('tipos_permiso').select('*').order('nombre');
    setTipos(t || []);
    const { data: s } = await supabase
      .from('solicitudes_permiso')
      .select('*, tipos_permiso(nombre)')
      .eq('trabajador_id', perfil.id)
      .order('created_at', { ascending: false });
    setLista(s || []);
  }

  useEffect(() => {
    if (perfil) cargar();
  }, [perfil?.id]);

  // Al elegir "Beneficio día de cumpleaños": arma las fechas posibles
  // (el cumpleaños si es hábil, y 5 días hábiles antes y después).
  useEffect(() => {
    if (!esCumple || !perfil) {
      setCumple(null);
      return;
    }
    if (!perfil.fecha_nacimiento) {
      setCumple({ error: 'No tienes fecha de nacimiento registrada. Contacta a RR.HH.' });
      return;
    }
    let cancelado = false;
    (async () => {
      const cumpleISO = cumpleEnAnio(perfil.fecha_nacimiento, anioCumple);
      const { desde, hasta } = rangoFeriados(cumpleISO);
      const [{ data }, { count: feriadosDelAnio }] = await Promise.all([
        supabase.from('feriados').select('fecha').gte('fecha', desde).lte('fecha', hasta),
        supabase
          .from('feriados')
          .select('fecha', { count: 'exact', head: true })
          .gte('fecha', `${anioCumple}-01-01`)
          .lte('fecha', `${anioCumple}-12-31`),
      ]);
      if (cancelado) return;
      if (!feriadosDelAnio) {
        setCumple({
          error: `Aún no están cargados los feriados de ${anioCumple}. Avisa a RR.HH. para poder pedir este beneficio.`,
        });
        return;
      }
      const feriados = new Set((data || []).map((f) => f.fecha));
      // Solo días desde hoy en adelante.
      const opciones = opcionesCumple(cumpleISO, feriados).filter((f) => f >= hoy);
      setCumple({ cumpleISO, opciones });
      // Primera opción: el mismo día del cumpleaños, si es hábil.
      setForm((f) => ({
        ...f,
        fecha_desde: opciones.includes(cumpleISO) ? cumpleISO : '',
        fecha_hasta: opciones.includes(cumpleISO) ? cumpleISO : '',
        hora_desde: '',
        hora_hasta: '',
        motivo: MOTIVO_CUMPLE,
      }));
    })();
    return () => {
      cancelado = true;
    };
  }, [esCumple, perfil?.id, anioCumple]);

  async function enviar(e) {
    e.preventDefault();
    setMensaje('');

    if (esCumple) {
      if (yaTieneCumple) {
        setMensaje(`Ya tienes una solicitud de este beneficio para ${anioCumple}.`);
        return;
      }
      if (!form.fecha_desde || !cumple?.opciones?.includes(form.fecha_desde)) {
        setMensaje('Elige el día que quieres tomar.');
        return;
      }
    }

    // Validaciones antes de mandarlo a la base — así se ve un mensaje claro
    // en vez del error crudo de la restricción de la tabla (que hoy dice
    // literal "violates check constraint solicitudes_permiso_check").
    if (form.fecha_hasta < form.fecha_desde) {
      setMensaje('La fecha "hasta" no puede ser anterior a la fecha "desde".');
      return;
    }
    if (
      form.fecha_desde === form.fecha_hasta &&
      form.hora_desde &&
      form.hora_hasta &&
      form.hora_hasta <= form.hora_desde
    ) {
      setMensaje('La hora "hasta" debe ser posterior a la hora "desde".');
      return;
    }

    setEnviando(true);
    const { data, error } = await supabase
      .from('solicitudes_permiso')
      .insert({
        trabajador_id: perfil.id,
        tipo_permiso_id: Number(form.tipo_permiso_id),
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        hora_desde: esCumple ? null : form.hora_desde,
        hora_hasta: esCumple ? null : form.hora_hasta,
        motivo: esCumple ? MOTIVO_CUMPLE : form.motivo,
      })
      .select()
      .single();
    setEnviando(false);
    if (error) {
      setMensaje(
        error.message.includes('ux_cumpleanos_uno_por_anio')
          ? `Ya tienes una solicitud de este beneficio para ${anioCumple}.`
          : error.message.includes('solicitudes_permiso_check')
          ? 'Revisa las fechas y horas — la fecha/hora "hasta" debe ser igual o posterior a la de "desde".'
          : 'Error: ' + error.message
      );
    } else {
      setMensaje('Solicitud enviada. Se avisó a tu jefe directo para que la revise.');
      setForm({
        tipo_permiso_id: '',
        fecha_desde: '',
        fecha_hasta: '',
        hora_desde: '',
        hora_hasta: '',
        motivo: '',
      });
      cargar();
      if (data) {
        supabase.functions
          .invoke('notificar-revision', { body: { tipo: 'permiso', solicitud_id: data.id } })
          .catch(() => {});
      }
    }
  }

  async function verPdf(s) {
    await verPdfPermiso({ ...s, tipo_permiso: s.tipos_permiso?.nombre }, perfil);
  }

  async function descargarPdf(s) {
    await descargarPdfPermiso({ ...s, tipo_permiso: s.tipos_permiso?.nombre }, perfil);
  }

  if (!perfil) return null;

  return (
    <AppShell links={trabajadorLinks} titulo="Solicitudes de permiso">
      <form onSubmit={enviar} className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <p className="text-sm font-bold text-[#153A5B]">Nueva solicitud</p>
        <select
          required
          value={form.tipo_permiso_id}
          onChange={(e) => setForm({ ...form, tipo_permiso_id: e.target.value })}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tipo de permiso</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        {esCumple && (
          <div className="space-y-3">
            {cumple?.error && <p className="text-xs text-red-600">{cumple.error}</p>}
            {!cumple?.error && yaTieneCumple && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
                Ya tienes una solicitud de este beneficio para {anioCumple} (pendiente o aprobada).
                Solo se puede una vez al año.
              </p>
            )}
            {cumple?.opciones && !yaTieneCumple && (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Beneficio de cumpleaños {anioCumple}. Es un día completo de permiso. Puedes tomarlo el día de tu cumpleaños (si es día
                  hábil) o elegir otro día hábil hasta 5 días hábiles antes o después.
                </p>
                <div>
                  <label className="text-xs text-slate-500">Día elegido</label>
                  <select
                    required
                    value={form.fecha_desde}
                    onChange={(e) =>
                      setForm({ ...form, fecha_desde: e.target.value, fecha_hasta: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Elige un día</option>
                    {cumple.opciones.map((f) => (
                      <option key={f} value={f}>
                        {etiquetaFecha(f, cumple.cumpleISO)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}
        {!esCumple && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Fecha desde</label>
            <input
              required
              type="date"
              value={form.fecha_desde}
              onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Fecha hasta</label>
            <input
              required
              type="date"
              value={form.fecha_hasta}
              onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        )}
        {!esCumple && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Hora desde</label>
            <input
              required
              type="time"
              value={form.hora_desde}
              onChange={(e) => setForm({ ...form, hora_desde: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Hora hasta</label>
            <input
              required
              type="time"
              value={form.hora_hasta}
              onChange={(e) => setForm({ ...form, hora_hasta: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        )}
        {!esCumple && (
        <textarea
          value={form.motivo}
          onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          placeholder="Motivo (opcional)"
          rows={2}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        )}
        <button
          disabled={enviando || (esCumple && (yaTieneCumple || !!cumple?.error))}
          className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2 text-sm"
        >
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        {mensaje && <p className="text-xs text-slate-500">{mensaje}</p>}
      </form>

      <p className="text-xs font-bold text-slate-400 tracking-wide mb-2">MIS SOLICITUDES</p>
      <div className="space-y-3">
        {lista.length === 0 && (
          <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4">
            Aún no tienes solicitudes.
          </p>
        )}
        {lista.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-[#153A5B]">{s.tipos_permiso?.nombre}</p>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${estadoStyle[s.estado]}`}>
                {s.estado}
              </span>
            </div>
            <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-slate-200 pl-3">
              {fraseSolicitud(s, perfil)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => verPdf(s)}
                className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
              >
                Ver PDF
              </button>
              <button
                onClick={() => descargarPdf(s)}
                className="text-xs font-bold text-slate-600 bg-slate-100 rounded-lg px-3 py-2"
              >
                Descargar
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
