import { supabase } from '@/lib/supabaseClient';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushDisponible() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permisoActual() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Registra el service worker, pide permiso de notificaciones, se suscribe
// a push y guarda la suscripción en el servidor. Se debe llamar desde un
// clic del usuario (los navegadores bloquean el pedido de permiso si no).
export async function activarNotificacionesPush() {
  if (!pushDisponible()) {
    throw new Error('Este navegador no soporta notificaciones push.');
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error('No diste permiso de notificaciones.');
  }

  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY.');
  }

  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion?.session?.access_token;

  const resp = await fetch('/api/push/suscribir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(suscripcion.toJSON()),
  });
  if (!resp.ok) {
    const json = await resp.json().catch(() => ({}));
    throw new Error(json.error || 'No se pudo guardar la suscripción.');
  }
}

// Desactiva las notificaciones push en este dispositivo.
export async function desactivarNotificacionesPush() {
  if (!pushDisponible()) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return;

  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion?.session?.access_token;

  await fetch('/api/push/suscribir', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: suscripcion.endpoint }),
  });
  await suscripcion.unsubscribe();
}

// ¿Ya hay una suscripción activa en este dispositivo/navegador?
export async function suscripcionActiva() {
  if (!pushDisponible()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  return !!suscripcion;
}
