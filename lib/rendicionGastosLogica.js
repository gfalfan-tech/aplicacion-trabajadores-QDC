// Helpers compartidos para Rendición de Gastos: formateo de montos,
// etiquetas de estado/categoría/tipo de documento y el cálculo de las
// fechas de resolución que ve el trabajador — mismo criterio que
// lib/estadoVacaciones.js, adaptado a esta rendición (que puede ser en
// CLP o USD, y donde la segunda firma es "Finanzas" en vez de un nombre
// de persona).

export const CATEGORIAS = [
  { value: 'combustible', label: 'Combustible' },
  { value: 'peaje', label: 'Peaje' },
  { value: 'transportes', label: 'Transportes' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'alimentacion', label: 'Alimentación' },
  { value: 'comidas_negocio', label: 'Comidas de Negocio' },
  { value: 'otros', label: 'Otros' },
];

const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

export function etiquetaCategoria(categoria) {
  return ETIQUETA_CATEGORIA[categoria] || categoria;
}

export const TIPOS_DOCUMENTO = [
  { value: 'factura', label: 'Factura' },
  { value: 'boleta', label: 'Boleta' },
  { value: 'vale_por', label: 'Vale por' },
];

const ETIQUETA_TIPO_DOCUMENTO = Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t.value, t.label]));

export function etiquetaTipoDocumento(tipo) {
  return ETIQUETA_TIPO_DOCUMENTO[tipo] || tipo;
}

export const estadoRendicionStyle = {
  borrador: 'bg-slate-100 text-slate-600',
  pendiente: 'bg-amber-100 text-amber-800',
  aprobada_jefe: 'bg-blue-100 text-blue-800',
  aprobada: 'bg-green-100 text-green-800',
  rechazada: 'bg-red-100 text-red-800',
};

export function estadoRendicionLabel(estado) {
  if (estado === 'aprobada_jefe') return 'aprobada, a la espera de firma de Finanzas';
  return estado;
}

// Formatea un monto según la moneda de la rendición: CLP sin decimales
// (como el resto del sistema), USD con centavos.
export function formatearMonto(monto, moneda) {
  if (moneda === 'USD') {
    return Number(monto || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Number(monto || 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });
}

export function totalLineas(lineas) {
  return (lineas || []).reduce((acc, l) => acc + Number(l.monto || 0), 0);
}

// Frase que explica la diferencia entre lo entregado por QDC y lo gastado.
// Positiva (sobró plata del anticipo) → el trabajador le debe la diferencia
// a la empresa. Negativa (gastó más de lo que le entregaron) → la empresa
// le debe reembolsar la diferencia al trabajador.
export function mensajeDiferencia(diferencia, moneda) {
  const monto = Number(diferencia || 0);
  if (monto === 0) return 'No hay diferencia — el total gastado coincide con lo entregado por QDC.';
  if (monto > 0) return `El total a devolver a la empresa es de ${formatearMonto(monto, moneda)}`;
  return `El total a reembolsar al trabajador es de ${formatearMonto(Math.abs(monto), moneda)}`;
}

// Arma las líneas de fecha para "Mis rendiciones": envío, aprobación del
// jefe directo (si la hubo) y resolución final. La resolución final puede
// haberla hecho Finanzas (segunda firma, o aprobación/rechazo único
// cuando no hay jefe directo válido) o el propio jefe directo (si
// rechazó en la primera etapa) — se calcula comparando aprobado_por con
// el jefe_directo_id del trabajador, igual que en vacaciones.
export function fechasResolucionRendicion(rendicion, jefeDirectoId) {
  const fechas = [];
  if (rendicion.fecha_envio) {
    fechas.push({ etiqueta: 'Enviada', fecha: rendicion.fecha_envio });
  } else {
    fechas.push({ etiqueta: 'Creada', fecha: rendicion.created_at });
  }

  if (rendicion.fecha_aprobacion_jefe) {
    fechas.push({ etiqueta: 'Aprobada por tu jefe directo', fecha: rendicion.fecha_aprobacion_jefe });
  }

  if (rendicion.fecha_resolucion) {
    const loResolvioElJefe =
      !rendicion.fecha_aprobacion_jefe &&
      rendicion.aprobado_por &&
      rendicion.aprobado_por === jefeDirectoId;
    const quien = loResolvioElJefe ? 'tu jefe directo' : 'Finanzas';
    const accion = rendicion.estado === 'rechazada' ? 'Rechazada por' : 'Resuelta por';
    fechas.push({ etiqueta: `${accion} ${quien}`, fecha: rendicion.fecha_resolucion });
  }

  return fechas;
}
