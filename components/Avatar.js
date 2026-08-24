'use client';

function iniciales(nombre) {
  return (nombre || '??')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Círculo con la foto de perfil de alguien, o sus iniciales si no tiene
// foto subida todavía. Se usa en el header, el mural, mensajes y las
// listas de trabajadores para que se vea igual en toda la app.
export default function Avatar({ url, nombre, size = 40, className = '' }) {
  const px = `${size}px`;
  if (url) {
    return (
      <img
        src={url}
        alt={nombre || 'Foto de perfil'}
        style={{ width: px, height: px }}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={`rounded-full bg-[#153A5B] text-white font-bold flex items-center justify-center shrink-0 ${className}`}
    >
      {iniciales(nombre)}
    </div>
  );
}
