export function sanitizeFileName(name) {
  const partes = name.split('.');
  const ext = partes.length > 1 ? partes.pop() : '';
  const base = partes.join('.');

  const normalizado = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/acentos (a, e, n con virgulilla, etc.)
    .replace(/[^a-zA-Z0-9]+/g, '_') // cualquier otro caracter raro -> "_"
    .replace(/^_+|_+$/g, '') // limpia "_" al principio/final
    .toLowerCase();

  return ext ? `${normalizado}.${ext.toLowerCase()}` : normalizado;
}
