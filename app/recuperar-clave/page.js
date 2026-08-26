'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RecuperarClave() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok' | 'error', texto }

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);
    try {
      const resp = await fetch('/api/auth/solicitar-acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMensaje({ tipo: 'error', texto: json.error || 'Ocurrió un error.' });
      } else {
        setMensaje({
          tipo: 'ok',
          texto: 'Listo. Te enviamos un correo con un link para crear tu contraseña — revisa tu bandeja de entrada (y la carpeta de spam por si acaso). El link es válido por un tiempo limitado.',
        });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo enviar la solicitud: ' + err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex justify-center mb-6">
          <img src="/qdc-logo.png" alt="QDC" className="h-10 w-auto" />
        </div>
        <p className="text-center text-sm font-bold text-[#153A5B] mb-1">
          ¿Olvidaste tu contraseña o es tu primera vez?
        </p>
        <p className="text-center text-xs text-slate-400 mb-6">
          Ingresa el correo con el que RR.HH. te registró y te enviamos un link para crear tu
          contraseña.
        </p>

        {mensaje?.tipo === 'ok' ? (
          <>
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              {mensaje.texto}
            </p>
            <Link
              href="/login"
              className="block text-center w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg py-2.5 text-sm"
            >
              Volver a Ingresar
            </Link>
          </>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <input
              required
              type="email"
              placeholder="Correo corporativo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {mensaje?.tipo === 'error' && <p className="text-xs text-red-600">{mensaje.texto}</p>}
            <button
              disabled={enviando}
              className="w-full bg-[#0F5C8C] text-white font-bold rounded-lg py-2.5 text-sm disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar link'}
            </button>
            <Link href="/login" className="block text-center text-xs font-bold text-[#0F5C8C] pt-1">
              ← Volver a Ingresar
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
