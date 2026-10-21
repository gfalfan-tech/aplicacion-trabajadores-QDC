// Lógica del beneficio "día de cumpleaños" en el navegador (la misma regla
// vive en la base: supabase/migrations/beneficio_cumpleanos.sql).
// Días hábiles = lunes a viernes que no sean feriado (tabla "feriados").

const pad = (n) => String(n).padStart(2, '0');
const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aFecha = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};

export function sumarDias(fechaISO, n) {
  const d = aFecha(fechaISO);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

export function esHabil(fechaISO, feriados) {
  const dow = aFecha(fechaISO).getDay();
  return dow !== 0 && dow !== 6 && !feriados.has(fechaISO);
}

// Cumpleaños en un año dado. Quien nació un 29 de febrero usa el 28 en
// años no bisiestos.
export function cumpleEnAnio(fechaNacimientoISO, anio) {
  const [, m, d] = fechaNacimientoISO.split('-').map(Number);
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  const dia = m === 2 && d === 29 && !bisiesto ? 28 : d;
  return `${anio}-${pad(m)}-${pad(dia)}`;
}

// Rango de fechas a consultar en la tabla de feriados para cubrir toda la
// ventana (5 días hábiles son como mucho ~15 días corridos).
export function rangoFeriados(cumpleISO) {
  return { desde: sumarDias(cumpleISO, -20), hasta: sumarDias(cumpleISO, 20) };
}

// Fechas que el trabajador puede elegir: el cumpleaños (si es hábil) y los
// 5 días hábiles antes y después.
export function opcionesCumple(cumpleISO, feriados) {
  const antes = [];
  const despues = [];
  let cursor = cumpleISO;
  for (let i = 0; i < 30 && antes.length < 5; i++) {
    cursor = sumarDias(cursor, -1);
    if (esHabil(cursor, feriados)) antes.push(cursor);
  }
  cursor = cumpleISO;
  for (let i = 0; i < 30 && despues.length < 5; i++) {
    cursor = sumarDias(cursor, 1);
    if (esHabil(cursor, feriados)) despues.push(cursor);
  }
  const medio = esHabil(cumpleISO, feriados) ? [cumpleISO] : [];
  return [...antes.reverse(), ...medio, ...despues];
}

export function etiquetaFecha(fechaISO, cumpleISO) {
  const txt = aFecha(fechaISO).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const t = txt.charAt(0).toUpperCase() + txt.slice(1);
  return fechaISO === cumpleISO ? `${t} (tu cumpleaños)` : t;
}
