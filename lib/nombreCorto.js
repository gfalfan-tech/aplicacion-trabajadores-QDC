// Extrae "Primer nombre + primer apellido" desde nombre_completo, que en
// esta app es un solo campo de texto (no hay nombre/apellido por separado).
// Convención chilena habitual: [Nombre1] [Nombre2 opcional] [ApellidoPaterno]
// [ApellidoMaterno opcional]. El apellido paterno puede ser compuesto
// ("Del Campo", "De La Fuente"), así que esas partículas se fusionan con la
// palabra siguiente antes de decidir cuáles palabras son nombres y cuáles
// apellidos.
const PARTICULAS = new Set(['del', 'de', 'la', 'los', 'las', 'san', 'santa']);

export function nombreCorto(nombreCompleto) {
  const limpio = String(nombreCompleto || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';

  const palabras = limpio.split(' ');

  // Fusiona partículas ("Del", "De la", etc.) con la palabra siguiente.
  const tokens = [];
  for (let i = 0; i < palabras.length; i++) {
    const actual = palabras[i];
    if (PARTICULAS.has(actual.toLowerCase()) && i + 1 < palabras.length) {
      tokens.push(`${actual} ${palabras[i + 1]}`);
      i++;
    } else {
      tokens.push(actual);
    }
  }

  if (tokens.length === 1) return tokens[0];

  const primerNombre = tokens[0];
  // Con 2 tokens: "Nombre Apellido" (sin apellido materno).
  // Con 3+ tokens: los últimos 2 son apellido paterno + materno; el resto,
  // nombres. El primer apellido es siempre el primero de esos últimos dos.
  const primerApellido = tokens.length === 2 ? tokens[1] : tokens[tokens.length - 2];

  return `${primerNombre} ${primerApellido}`;
}
