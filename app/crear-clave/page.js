'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';

export default function CrearClave() {
  const router = useRouter();
  const { session, cargando } = useAuth();
  const [clave, setClave] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError('');

    if (clave.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (clave !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);

    const { error: updateAuthError } = await supabase.auth.updateUser({ password: clave });
    if (updateAuthError) {
      setEnviando(false);
      setError('No se pudo guardar la contraseña: ' + updateAuthError.message);
      return;
    }

    if (session?.user?.id) {
      await supabase
        .from('trabajadores')
        .update({ clave_definida: true })
        .eq('id', session.user.id);
    }

    setEnviando(false);
    router.replace('/');
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Cargando…
      </div>
    );
  }

  if (!session) {
    router.replace('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex justify-center mb-6">
          <img src="/qdc-logo.png" alt="QDC" className="h-10 w-auto" />
        </div>
        <p className="text-center text-sm text-slate-500 mb-1">¡Bienvenido/a al Portal QDC!</p>
        <p className="text-center text-xs text-slate-400 mb-6">
          Antes de continuar, crea la contraseña con la que vas a entrar la próxima vez.
        </p>
        <form onSubmit={guardar} className="space-y-3">
          <input
            required
            type="password"
            placeholder="Nueva contraseña (mínimo 8 caracteres)"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="Repite la contraseña"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            disabled={enviando}
            className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2.5 text-sm"
          >
            {enviando ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
