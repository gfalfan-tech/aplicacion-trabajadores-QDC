export const trabajadorLinks = [
  { href: '/trabajador', label: 'Inicio', icon: '🏠' },
  { href: '/mensajes', label: 'Mensajes', icon: '💬' },
  { href: '/trabajador/directorio', label: 'Directorio', icon: '🔍' },
  { href: '/trabajador/solicitudes', label: 'Permisos', icon: '📝' },
  { href: '/trabajador/vacaciones', label: 'Vacaciones', icon: '🏖️' },
  { href: '/trabajador/certificados', label: 'Certificados', icon: '📄' },
  { href: '/trabajador/documentos', label: 'Documentos', icon: '📚' },
  { href: '/trabajador/mural', label: 'Mural', icon: '📰' },
  { href: '/trabajador/perfil', label: 'Perfil', icon: '👤' },
];

export const rrhhLinks = [
  { href: '/rrhh', label: 'Dashboard', icon: '🏠' },
  { href: '/mensajes', label: 'Mensajes', icon: '💬' },
  { href: '/trabajador/directorio', label: 'Directorio', icon: '🔍' },
  { href: '/trabajador/equipo', label: 'Aprobaciones', icon: '✅' },
  { href: '/rrhh/trabajadores', label: 'Trabajadores', icon: '👥' },
  { href: '/rrhh/certificados', label: 'Certificados', icon: '📄' },
  { href: '/rrhh/documentos', label: 'Documentos', icon: '📚' },
  { href: '/rrhh/mural', label: 'Mural', icon: '📰' },
  // Solo visible para el rol "administrador" — AppShell filtra este ítem
  // (y bloquea la página) para cualquiera que solo tenga rrhh/jefatura.
  { href: '/rrhh/respaldos', label: 'Respaldos', icon: '🗂️', soloAdministrador: true },
];
