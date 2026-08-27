'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/useAuth';
import NotificacionesBell from '@/components/NotificacionesBell';
import { useConversaciones } from '@/lib/useConversaciones';
import { useNotificaciones } from '@/lib/useNotificaciones';
import { useBadgeApp } from '@/lib/useBadgeApp';
import Avatar from '@/components/Avatar';

const CLAVE_COLAPSADO = 'qdc_menu_colapsado';
export const CLAVE_ULTIMA_VISTA = 'qdc_ultima_vista';

export default function AppShell({ links, titulo, children, requiereRRHH = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, perfil, esRRHH, cargando } = useAuth();
  const [colapsado, setColapsado] = useState(false);
  const [mostrarMas, setMostrarMas] = useState(false);
  const { totalNoLeidos } = useConversaciones(perfil?.id);
  const { notificaciones, noLeidas, marcarLeida, marcarTodasLeidas } = useNotificaciones(perfil?.id);

  // Número que se muestra fuera de la app, sobre el ícono (mensajes +
  // notificaciones sin leer, lo mismo que ya se ve como globitos rojos
  // acá adentro). No cambia ningún funcionamiento existente, solo lo
  // refleja hacia afuera.
  useBadgeApp(totalNoLeidos + noLeidas);

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_COLAPSADO);
    if (guardado === '1') setColapsado(true);
  }, []);

  // Recuerda si la última pantalla que se visitó fue del panel RR.HH. o de
  // la vista trabajador. Páginas "neutrales" como /mensajes usan esto para
  // saber qué menú mostrarle a alguien con doble rol (RRHH que además
  // puede navegar como trabajador) — de lo contrario esas pantallas solo
  // miran el rol y siempre lo mandan de vuelta a RR.HH.
  useEffect(() => {
    if (pathname.startsWith('/rrhh')) {
      window.localStorage.setItem(CLAVE_ULTIMA_VISTA, 'rrhh');
    } else if (pathname.startsWith('/trabajador')) {
      window.localStorage.setItem(CLAVE_ULTIMA_VISTA, 'trabajador');
    }
  }, [pathname]);

  // Cierra la hoja de "Más" al navegar a otra pantalla.
  useEffect(() => {
    setMostrarMas(false);
  }, [pathname]);

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
    // Ojo: el perfil y los roles se cargan aparte (y un poco después) de la
    // sesión. Sin este "if (!perfil) return", justo en ese instante en que
    // ya hay sesión pero el perfil/roles todavía no llegan, esRRHH vale
    // "false" por defecto y esto mandaba a un RRHH de vuelta a /trabajador
    // antes de que alcanzara a cargar su rol real — el "cambio de perfil"
    // random al navegar.
    if (!perfil) return;
    if (!perfil.clave_definida) {
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

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const otraVista = pathname.startsWith('/rrhh')
    ? { href: '/trabajador', label: 'Ir a vista trabajador' }
    : { href: '/rrhh', label: 'Ir a panel RR.HH.' };

  // La barra inferior del celular solo tiene espacio cómodo para unos
  // pocos accesos. Si hay más de 5 (como pasa desde que agregamos
  // "Mensajes"), los primeros 4 quedan fijos y el resto — incluyendo
  // Documentos, Mural o Perfil, que antes quedaban totalmente
  // inalcanzables en el celular — se mueve a la hoja de "Más".
  const linksVisiblesMovil = links.length > 5 ? links.slice(0, 4) : links;
  const linksResto = links.length > 5 ? links.slice(4) : [];

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
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative ${
                colapsado ? 'justify-center' : ''
              } ${
                pathname === l.href
                  ? 'bg-[#0F5C8C] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="relative">
                {l.icon}
                {l.href === '/mensajes' && totalNoLeidos > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                    {totalNoLeidos > 9 ? '9+' : totalNoLeidos}
                  </span>
                )}
              </span>
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
            <NotificacionesBell
              esRRHH={esRRHH}
              notificaciones={notificaciones}
              noLeidas={noLeidas}
              marcarLeida={marcarLeida}
              marcarTodasLeidas={marcarTodasLeidas}
            />
            <Avatar url={perfil.avatar_url} nombre={perfil.nombre_completo} size={32} />
          </div>
        </div>

        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <img src="/qdc-logo.png" alt="QDC" className="h-7 w-auto" />
            <span className="text-xs font-bold text-[#153A5B]">{titulo}</span>
          </div>
          <div className="flex items-center gap-2">
            {esRRHH && (
              <Link
                href={otraVista.href}
                title={otraVista.label}
                className="w-8 h-8 rounded-full border border-slate-200 text-[#0F5C8C] text-base flex items-center justify-center"
              >
                ⇄
              </Link>
            )}
            <NotificacionesBell
              esRRHH={esRRHH}
              notificaciones={notificaciones}
              noLeidas={noLeidas}
              marcarLeida={marcarLeida}
              marcarTodasLeidas={marcarTodasLeidas}
            />
            <Avatar url={perfil.avatar_url} nombre={perfil.nombre_completo} size={32} />
          </div>
        </div>

        <main className="max-w-3xl md:max-w-4xl lg:max-w-6xl mx-auto p-4 md:p-8">{children}</main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around py-2 z-10">
        {linksVisiblesMovil.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center text-[10px] gap-1 ${
              pathname === l.href ? 'text-[#0F5C8C] font-bold' : 'text-slate-400'
            }`}
          >
            <span className="relative text-lg">
              {l.icon}
              {l.href === '/mensajes' && totalNoLeidos > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                  {totalNoLeidos > 9 ? '9+' : totalNoLeidos}
                </span>
              )}
            </span>
            {l.label}
          </Link>
        ))}
        {linksResto.length > 0 && (
          <button
            onClick={() => setMostrarMas(true)}
            className={`flex flex-col items-center text-[10px] gap-1 ${
              linksResto.some((l) => l.href === pathname) ? 'text-[#0F5C8C] font-bold' : 'text-slate-400'
            }`}
          >
            <span className="text-lg">⋯</span>
            Más
          </button>
        )}
      </nav>

      {/* Hoja con el resto de los accesos que no caben en la barra inferior */}
      {mostrarMas && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30 flex items-end"
          onClick={() => setMostrarMas(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full rounded-t-2xl pb-6 pt-2 max-h-[70vh] overflow-y-auto"
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
            {linksResto.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMostrarMas(false)}
                className={`flex items-center gap-3 px-5 py-3 text-sm font-medium relative ${
                  pathname === l.href ? 'text-[#0F5C8C] font-bold' : 'text-slate-600'
                }`}
              >
                <span className="relative text-lg">
                  {l.icon}
                  {l.href === '/mensajes' && totalNoLeidos > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                      {totalNoLeidos > 9 ? '9+' : totalNoLeidos}
                    </span>
                  )}
                </span>
                {l.label}
              </Link>
            ))}
            <button
              onClick={salir}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm font-medium text-red-600 text-left"
            >
              <span className="text-lg">⏻</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}