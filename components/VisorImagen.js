'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Visor de imágenes del mural: toca la imagen para verla a pantalla completa.
// - Zoom con dos dedos (pellizco), doble toque o rueda del mouse
// - Arrastrar para moverse (subir/bajar/izquierda/derecha) cuando hay zoom
// - Botón "Volver", tecla Esc y botón Atrás del celular cierran el visor
const MIN = 1;
const MAX = 5;

export default function VisorImagen({ src, alt = '', className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const abrir = () => {
    try {
      window.history.pushState({ visorImagen: true }, '');
    } catch {}
    setAbierto(true);
  };

  // cierre: si el visor dejó una entrada en el historial, la retiramos
  const cerrar = useCallback(() => {
    setAbierto(false);
    try {
      if (window.history.state && window.history.state.visorImagen) window.history.back();
    } catch {}
  }, []);

  // botón Atrás del celular
  useEffect(() => {
    if (!abierto) return;
    const onPop = () => setAbierto(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [abierto]);

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={abrir}
        className={`cursor-zoom-in ${className}`}
      />
      {abierto && montado && createPortal(<Pantalla src={src} alt={alt} onVolver={cerrar} />, document.body)}
    </>
  );
}

function Pantalla({ src, alt, onVolver }) {
  const [t, setT] = useState({ x: 0, y: 0, s: 1 });
  const tRef = useRef(t);
  tRef.current = t;
  const caja = useRef(null);
  const punteros = useRef(new Map());
  const gesto = useRef(null);
  const ultimoToque = useRef(0);

  // bloquear el scroll de la página de fondo mientras está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onVolver();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onVolver]);

  // mantiene la imagen dentro de la pantalla
  const limitar = useCallback((n) => {
    const el = caja.current;
    if (!el) return n;
    const s = Math.min(MAX, Math.max(MIN, n.s));
    if (s === 1) return { x: 0, y: 0, s: 1 };
    const mx = (el.clientWidth * (s - 1)) / 2;
    const my = (el.clientHeight * (s - 1)) / 2;
    return { s, x: Math.min(mx, Math.max(-mx, n.x)), y: Math.min(my, Math.max(-my, n.y)) };
  }, []);

  const zoomEn = useCallback(
    (cx, cy, nuevoS) => {
      const el = caja.current;
      const r = el.getBoundingClientRect();
      const px = cx - (r.left + r.width / 2);
      const py = cy - (r.top + r.height / 2);
      const { x, y, s } = tRef.current;
      const k = Math.min(MAX, Math.max(MIN, nuevoS)) / s;
      setT(limitar({ s: s * k, x: px - (px - x) * k, y: py - (py - y) * k }));
    },
    [limitar]
  );

  const dist = () => {
    const [a, b] = [...punteros.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2) {
      gesto.current = { tipo: 'pinch', d0: dist(), s0: tRef.current.s };
    } else if (punteros.current.size === 1) {
      gesto.current = {
        tipo: 'pan',
        x0: e.clientX,
        y0: e.clientY,
        tx: tRef.current.x,
        ty: tRef.current.y,
        movido: false,
      };
    }
  };

  const onMove = (e) => {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === 'pinch' && punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, g.s0 * (dist() / g.d0));
    } else if (g.tipo === 'pan' && punteros.current.size === 1) {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.movido = true;
      if (tRef.current.s > 1) setT(limitar({ ...tRef.current, x: g.tx + dx, y: g.ty + dy }));
    }
  };

  const onUp = (e) => {
    const g = gesto.current;
    punteros.current.delete(e.pointerId);
    if (punteros.current.size === 1) {
      // quedó un dedo tras el pellizco: seguir moviendo desde ahí
      const [p] = [...punteros.current.values()];
      gesto.current = { tipo: 'pan', x0: p.x, y0: p.y, tx: tRef.current.x, ty: tRef.current.y, movido: true };
      return;
    }
    if (punteros.current.size === 0 && g && g.tipo === 'pan' && !g.movido) {
      // toque simple: detectar doble toque
      const ahora = Date.now();
      if (ahora - ultimoToque.current < 300) {
        ultimoToque.current = 0;
        if (tRef.current.s > 1) setT({ x: 0, y: 0, s: 1 });
        else zoomEn(e.clientX, e.clientY, 2.5);
      } else {
        ultimoToque.current = ahora;
      }
    }
    if (punteros.current.size === 0) gesto.current = null;
  };

  const onWheel = (e) => {
    zoomEn(e.clientX, e.clientY, tRef.current.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const cambiar = (factor) => {
    const r = caja.current.getBoundingClientRect();
    zoomEn(r.left + r.width / 2, r.top + r.height / 2, tRef.current.s * factor);
  };

  const btn =
    'w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl leading-none flex items-center justify-center backdrop-blur select-none';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button
          type="button"
          onClick={onVolver}
          className="px-4 h-11 rounded-full bg-white/15 hover:bg-white/25 text-sm font-semibold backdrop-blur"
        >
          ← Volver
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => cambiar(1 / 1.5)} className={btn} aria-label="Alejar">
            −
          </button>
          <button type="button" onClick={() => cambiar(1.5)} className={btn} aria-label="Acercar">
            +
          </button>
        </div>
      </div>

      <div
        ref={caja}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ touchAction: 'none', cursor: t.s > 1 ? 'grab' : 'zoom-in' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            transition: gesto.current ? 'none' : 'transform 0.2s ease-out',
            willChange: 'transform',
          }}
        />
      </div>

      <p className="text-center text-white/60 text-xs py-2">
        Pellizca o toca dos veces para acercar · arrastra para moverte
      </p>
    </div>
  );
}
