'use client';

import { useEffect } from 'react';

// Sincroniza el número de pendientes (notificaciones + mensajes sin leer)
// con el "badge" — el globito con el número que el sistema operativo
// dibuja sobre el ícono de la app — usando la Badging API del navegador.
// Funciona en Android/Chrome y de escritorio, y en iPhone cuando el
// Gestión RRHH está agregado a la pantalla de inicio (iOS 16.4+). En
// cualquier navegador que no la soporte, simplemente no hace nada: nunca
// debe romper ni cambiar el resto de la app.
export function useBadgeApp(cantidad) {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
    try {
      if (cantidad > 0) {
        navigator.setAppBadge(cantidad).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    } catch (e) {
      // El badge es un extra visual: si falla, no debe afectar nada más.
    }
  }, [cantidad]);
}
