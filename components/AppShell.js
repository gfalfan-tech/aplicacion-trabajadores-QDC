'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import NotificacionesBell from '@/components/NotificacionesBell';

const CLAVE_COLAPSADO = 'qdc_menu_colapsado';

export default function AppShell({ links, titulo, children, requiereRRHH = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, perfil, esRRHH, cargando } = useAuth();
  const [colapsado, setColapsado] = useState(false);

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_COLAPSADO);
    if (guardado === '1') setColapsado(true);
  }, []);

  function toggleColapsado() {
    setColapsado((v) => {
      const nuevo = !v;
      window.localStorage.setItem(CLAVE_COLAPSADO, nuevo ? '1' : '0');
      return nuevo;
    });
  }

  useEffect(() => {
    if (cargando) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    if (perfil && !perfil.clave_definida) {
      router.replace('/crear-clave');
      return;
    }
    if (requiereRRHH && !esRRHH) {
      router.replace('/trabajador');
    }
  }, [cargando, session, perfil, esRRHH, requiereRRHH, router]);

  if (
    cargando ||
    !session ||
    !perfil ||
    !perfil.clave_definida ||
    (requiereRRHH && !esRRHH)
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Cargando…
      </div>
    );
  }

  const iniciales = (perfil.nombre_completo || '??')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const otraVista = pathname.startsWith('/rrhh')
    ? { href: '/trabajador', label: 'Ir a vista trabajador' }
    : { href: '/rrhh', label: 'Ir a panel RR.HH.' };

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <aside
        className={`hidden md:flex md:flex-col bg-white border-r border-slate-200 md:fixed md:inset-y-0 transition-all duration-150 ${
          colapsado ? 'md:w-16' : 'md:w-60'
        }`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-4 border-b border-slate-200 ${
            colapsado ? 'justify-center' : 'justify-between'
          }`}
        >
          {colapsado ? (
            <img src="/qdc-logo.png" alt="QDC" className="h-7 w-auto" />
          ) : (
            <div className="flex items-center gap-2 px-2">
              <img src="/qdc-logo.png" alt="QDC" className="h-8 w-auto" />
              <span className="text-sm font-bold text-[#153A5B]">Portal QDC</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={colapsado ? l.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                colapsado ? 'justify-center' : ''
              } ${
                pathname === l.href
                  ? 'bg-[#0F5C8C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{l.icon}</span>
              {!colapsado && l.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={toggleColapsado}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className={`mx-2 mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg py-2 ${
            colapsado ? 'justify-center px-2' : 'px-3'
          }`}
        >
          <span className="text-sm">{colapsado ? '»' : '«'}</span>
          {!colapsado && 'Colapsar menú'}
        </button>

        {esRRHH && (
          <div className="px-2 pb-2">
            <Link
              href={otraVista.href}
              title={colapsado ? otraVista.label : undefined}
              className={`block text-center text-xs font-semibold text-[#0F5C8C] py-2 rounded-lg border border-slate-200 hover:bg-slate-50 ${
                colapsado ? 'px-1' : 'px-3'
              }`}
            >
              {colapsado ? '⇄' : otraVista.label}
            </Link>
          </div>
        )}
        <button
          onClick={salir}
          title={colapsado ? 'Cerrar sesión' : undefined}
          className={`m-3 text-sm text-red-600 font-medium py-2 text-left ${colapsado ? 'text-center px-0' : 'px-3'}`}
        >
          {colapsado ? '⏻' : 'Cerrar sesión'}
        </button>
      </aside>

      <div className={`flex-1 pb-16 md:pb-0 transition-all duration-150 ${colapsado ? 'md:ml-16' : 'md:ml-60'}`}>
        <div className="hidden md:flex bg-white border-b border-slate-200 px-6 py-3 items-center justify-between sticky top-0 z-10">
          <h1 className="text-lg font-bold text-[#153A5B]">{titulo}</h1>
          <div className="flex items-center gap-3">
            <NotificacionesBell trabajadorId={perfil.id} />
            <div className="w-8 h-8 rounded-full bg-[#153A5B] text-white text-xs font-bold flex items-center justify-center">
              {iniciales}
            </div>
          </div>
        </div>

        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <img src="/qdc-logo.png" alt="QDC" className="h-7 w-auto" />
            <span className="text-xs font-bold text-[#153A5B]">{titulo}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificacionesBell trabajadorId={perfil.id} />
            <div className="w-8 h-8 rounded-full bg-[#153A5B] text-white text-xs font-bold flex items-center justify-center">
              {iniciales}
            </div>
          </div>
        </div>

        <main className="max-w-3xl mx-auto p-4 md:p-8">{children}</main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around py-2 z-10">
        {links.slice(0, 5).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center text-[10px] gap-1 ${
              pathname === l.href ? 'text-[#0F5C8C] font-bold' : 'text-slate-400'
            }`}
          >
            <span className="text-lg">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}