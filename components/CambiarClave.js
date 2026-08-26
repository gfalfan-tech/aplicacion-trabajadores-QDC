'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Sección de "Cambiar mi clave" en el perfil del trabajador. Pide la clave
// actual (para confirmar que es realmente el dueño de la cuenta quien la
// cambia) y la nueva clave dos veces. Si RR.HH. le había asignado una
// clave antes, al guardar acá esa queda reemplazada por esta.
export default function CambiarClave({ email }) {
  const [abierto, setAbierto] = useState(false);
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveNueva2, setClaveNueva2] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }

  function limpiarYcerrar() {
    setAbierto(false);
    setClaveActual('');
    setClaveNueva('');
    setClaveNueva2('');
    setMensaje(null);
  }

  async function guardar(e) {
    e.preventDefault();
    setMensaje(null);

    if (claveNueva.length < 6) {
      setMensaje({ tipo: 'error', texto: 'La nueva clave debe tener al menos 6 caracteres.' });
      return;
    }
    if (claveNueva !== claveNueva2) {
      setMensaje({ tipo: 'error', texto: 'Las dos claves nuevas no coinciden.' });
      return;
    }

    setGuardando(true);

    // Confirmamos identidad reingresando la clave actual antes de cambiarla.
    const { error: errorActual } = await supabase.auth.signInWithPassword({
      email,
      password: claveActual,
    });
    if (errorActual) {
      setGuardando(false);
      setMensaje({ tipo: 'error', texto: 'Tu clave actual no es correcta.' });
      return;
    }

    const { error: errorNueva } = await supabase.auth.updateUser({ password: claveNueva });
    setGuardando(false);
    if (errorNueva) {
      setMensaje({ tipo: 'error', texto: 'No se pudo cambiar la clave: ' + errorNueva.message });
      return;
    }

    setClaveActual('');
    setClaveNueva('');
    setClaveNueva2('');
    setMensaje({ tipo: 'ok', texto: 'Tu clave fue actualizada.' });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <button
        onClick={() => (abierto ? limpiarYcerrar() : setAbierto(true))}
        className="w-full flex items-center justify-between text-sm font-bold text-[#153A5B]"
      >
        🔒 Cambiar mi clave
        <span className="text-slate-400 text-xs font-normal">{abierto ? 'Cerrar' : 'Abrir'}</span>
      </button>

      {abierto && (
        <form onSubmit={guardar} className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          <input
            required
            type="password"
            placeholder="Clave actual"
            value={claveActual}
            onChange={(e) => setClaveActual(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="Clave nueva (mín. 6 caracteres)"
            value={claveNueva}
            onChange={(e) => setClaveNueva(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="Repite la clave nueva"
            value={claveNueva2}
            onChange={(e) => setClaveNueva2(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {mensaje && (
            <p className={`text-xs ${mensaje.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
              {mensaje.texto}
            </p>
          )}
          <button
            disabled={guardando}
            className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2.5 text-sm disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar nueva clave'}
          </button>
        </form>
      )}
    </div>
  );
}
