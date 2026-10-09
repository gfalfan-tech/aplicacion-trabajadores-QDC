'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setCargando(false);
    if (error) {
      // Mensaje específico según la causa real, para poder diagnosticar
      // (antes decía siempre "Correo o contraseña incorrectos", lo que
      // ocultaba casos como cuenta no confirmada o demasiados intentos).
      const msg = error.message || '';
      if (msg.includes('Invalid login credentials')) {
        setError('Correo o contraseña incorrectos.');
      } else if (msg.includes('Email not confirmed')) {
        setError('Tu cuenta aún no está confirmada. Contacta a RR.HH.');
      } else if (msg.includes('rate limit') || msg.includes('Too many')) {
        setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      } else {
        setError('No se pudo ingresar: ' + msg);
      }
    } else {
      // Registrar inicio de sesión en auditoría (silencioso: no bloquea el login)
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.user?.id) {
          const uid = s.user.id;
          // Evitar duplicados: no insertar si ya hay un LOGIN en los últimos 30 min
          const hace30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: reciente } = await supabase
            .from('auditoria')
            .select('id')
            .eq('trabajador_id', uid)
            .eq('accion', 'LOGIN')
            .gte('created_at', hace30min)
            .limit(1);
          if (!reciente || reciente.length === 0) {
            await supabase.from('auditoria').insert({
              trabajador_id: uid,
              accion: 'LOGIN',
              tabla_afectada: null,
              detalle: { origen: 'web' },
            });
          }
        }
      } catch (_) {
        // Error de auditoría ignorado: no debe afectar el inicio de sesión
      }
      router.replace('/');
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex justify-center mb-6">
          <img src="/qdc-logo.png" alt="QDC" className="h-10 w-auto" />
        </div>
        <p className="text-center text-sm text-slate-500 mb-6">Portal de Gestión de Personas</p>
        <form onSubmit={entrar} className="space-y-3">
          <input
            required
            type="email"
            placeholder="Correo corporativo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            disabled={cargando}
            className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2.5 text-sm"
          >
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <Link
          href="/recuperar-clave"
          className="block text-center text-xs font-bold text-[#0F5C8C] mt-4"
        >
          ¿Olvidaste tu contraseña o es tu primera vez?
        </Link>
      </div>
    </div>
  );
}
