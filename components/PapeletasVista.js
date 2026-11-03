'use client';

import { useEffect, useMemo, useState } from 'react';
import { obtenerPapeletas, formalizarPapeleta, notificarPapeleta } from '@/lib/papeletas';
import { formatFechaCorta } from '@/lib/pdfComun';
import { verPdfPermiso, descargarPdfPermiso, verPdfVacaciones, descargarPdfVacaciones } from '@/lib/solicitudPdf';

// Pantalla de control de papeletas: permisos y vacaciones ya APROBADOS que
// hay que imprimir, firmar a mano y marcar como "formalizados". Se usa en
// /rrhh/papeletas (RR.HH.) y /trabajador/papeletas (rol "formalizar
// papeletas", sin ser RR.HH.).

const FILTROS = [
  { key: 'pendientes', label: 'Pend. papeleta' },
  { key: 'formalizadas', label: 'Formalizadas' },
  { key: 'todas', label: 'Todas' },
];

const TIPOS = [
  { key: 'todos', label: 'Permisos y vacaciones' },
  { key: 'permisos', label: 'Permisos' },
  { key: 'vacaciones', label: 'Vacaciones' },
];

function fechaHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  });
}

function rangoFechas(s) {
  const { fecha_desde: d, fecha_hasta: h } = s;
  return d === h ? formatFechaCorta(d) : `${formatFechaCorta(d)} – ${formatFechaCorta(h)}`;
}

function verPdf(item) {
  return item._tipo === 'permisos'
    ? verPdfPermiso(item.solicitud, item.trabajador)
    : verPdfVacaciones(item.solicitud, item.trabajador);
}
function descargarPdf(item) {
  return item._tipo === 'permisos'
    ? descargarPdfPermiso(item.solicitud, item.trabajador)
    : descargarPdfVacaciones(item.solicitud, item.trabajador);
}

function Tarjeta({ item, ocupado, aviso, onFormalizar, onNotificar }) {
  const s = item.solicitud;
  const formalizada = !!item.formalizada_at;
  const t = item.linea_tiempo || {};
  const esPermiso = item._tipo === 'permisos';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#153A5B]">{item.trabajador_nombre}</p>
          {item.trabajador_rut && <p className="text-xs text-slate-500">RUT {item.trabajador_rut}</p>}
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
            formalizada ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {formalizada ? '✓ Formalizada' : 'Aprobado — falta papeleta'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">{esPermiso ? 'Fechas del permiso' : 'Fechas de vacaciones'}</p>
          <p className="text-slate-700">{rangoFechas(s)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Tipo</p>
          <p className="text-slate-700">
            {esPermiso ? s.tipo_permiso || 'Permiso' : `Vacaciones · ${s.dias_habiles} día(s) hábil(es)`}
          </p>
        </div>
      </div>
      {esPermiso && s.motivo && <p className="text-xs text-slate-600 mb-3">Motivo: {s.motivo}</p>}

      <label className="flex items-center gap-2 text-xs font-bold text-[#153A5B] mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formalizada}
          disabled={ocupado}
          onChange={(e) => onFormalizar(e.target.checked)}
          className="w-4 h-4"
        />
        Formulario formalizado (papeleta firmada)
      </label>

      <div className="flex gap-2 flex-wrap mb-3">
        <button
          onClick={() => verPdf(item)}
          className="text-xs font-bold text-[#0F5C8C] bg-[#E6F1FB] rounded-lg px-3 py-2"
        >
          Ver / imprimir papeleta
        </button>
        <button
          onClick={() => descargarPdf(item)}
          className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2"
        >
          Descargar
        </button>
        {!formalizada && (
          <button
            onClick={onNotificar}
            disabled={ocupado}
            className="text-xs font-bold text-slate-600 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-60"
          >
            🔔 Notificar al trabajador
          </button>
        )}
      </div>
      {aviso && <p className="text-xs text-green-700 mb-2">{aviso}</p>}

      <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-500 space-y-0.5">
        {t.creada && <p>{fechaHora(t.creada)} — Solicitud creada</p>}
        {t.aprobada_jefe && (
          <p>
            {fechaHora(t.aprobada_jefe)} — Aprobada por {t.jefe_nombre || 'jefe directo'}
          </p>
        )}
        {t.resolucion && <p>{fechaHora(t.resolucion)} — Aprobada por RR.HH.</p>}
        {formalizada && (
          <p className="text-green-700">
            {fechaHora(item.formalizada_at)} — Formalizada{item.formalizada_por_nombre ? ` por ${item.formalizada_por_nombre}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PapeletasVista() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('pendientes');
  const [tipo, setTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [ocupadoId, setOcupadoId] = useState(null);
  const [avisos, setAvisos] = useState({});

  useEffect(() => {
    obtenerPapeletas()
      .then((d) => {
        const todos = [
          ...d.permisos.map((i) => ({ ...i, _tipo: 'permisos' })),
          ...d.vacaciones.map((i) => ({ ...i, _tipo: 'vacaciones' })),
        ];
        setItems(todos);
      })
      .catch((e) => setError(e.message));
  }, []);

  const clave = (i) => `${i._tipo}-${i.id}`;

  async function alternarFormalizada(item, valor) {
    setOcupadoId(clave(item));
    setError('');
    try {
      const r = await formalizarPapeleta(item._tipo === 'permisos' ? 'permiso' : 'vacaciones', item.id, valor);
      setItems((lista) =>
        lista.map((i) =>
          clave(i) === clave(item)
            ? { ...i, formalizada_at: r.formalizada_at, formalizada_por_nombre: r.formalizada_por_nombre }
            : i
        )
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupadoId(null);
    }
  }

  async function notificar(item) {
    setOcupadoId(clave(item));
    setError('');
    try {
      await notificarPapeleta(item._tipo === 'permisos' ? 'permiso' : 'vacaciones', item.id);
      setAvisos((a) => ({ ...a, [clave(item)]: `Aviso enviado a ${item.trabajador_nombre}.` }));
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupadoId(null);
    }
  }

  const pendientes = useMemo(() => (items || []).filter((i) => !i.formalizada_at).length, [items]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qRut = q.replace(/[.\-\s]/g, '');
    return (items || [])
      .filter((i) => (filtro === 'pendientes' ? !i.formalizada_at : filtro === 'formalizadas' ? !!i.formalizada_at : true))
      .filter((i) => tipo === 'todos' || i._tipo === tipo)
      .filter((i) => {
        if (!q) return true;
        const rut = (i.trabajador_rut || '').toLowerCase().replace(/[.\-\s]/g, '');
        return i.trabajador_nombre.toLowerCase().includes(q) || (qRut && rut.includes(qRut));
      })
      .sort((a, b) => ((a.fecha || '') < (b.fecha || '') ? 1 : -1));
  }, [items, filtro, tipo, busqueda]);

  if (error && !items) return <p className="text-sm text-red-600">{error}</p>;
  if (!items) return <p className="text-sm text-slate-400">Cargando…</p>;

  return (
    <>
      <p className="text-xs text-slate-500 mb-3">
        Permisos y vacaciones aprobados: imprime la papeleta, que la firme el trabajador y marca el check cuando
        esté formalizada.
      </p>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o RUT…"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 bg-white"
      />

      <div className="flex gap-2 flex-wrap mb-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`text-xs font-bold rounded-full px-3 py-1.5 border ${
              filtro === f.key ? 'bg-[#153A5B] text-white border-[#153A5B]' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {f.label}
            {f.key === 'pendientes' ? ` (${pendientes})` : ''}
          </button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        {TIPOS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTipo(f.key)}
            className={`text-[11px] font-bold rounded-full px-3 py-1 border ${
              tipo === f.key ? 'bg-[#E6F1FB] text-[#0F5C8C] border-[#0F5C8C]' : 'bg-white text-slate-500 border-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-3 mb-3">{error}</p>}

      <div className="space-y-3">
        {visibles.length === 0 && (
          <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-4">
            {filtro === 'pendientes' ? 'No hay papeletas pendientes de formalizar. 🎉' : 'Sin resultados.'}
          </p>
        )}
        {visibles.map((item) => (
          <Tarjeta
            key={clave(item)}
            item={item}
            ocupado={ocupadoId === clave(item)}
            aviso={avisos[clave(item)]}
            onFormalizar={(v) => alternarFormalizada(item, v)}
            onNotificar={() => notificar(item)}
          />
        ))}
      </div>
    </>
  );
}
