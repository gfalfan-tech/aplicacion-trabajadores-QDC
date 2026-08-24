// Registra las fuentes propias (Caveat y Baloo 2, incluidas en lib/fonts)
// para que sharp/librsvg las puedan usar al renderizar las tarjetas de
// cumpleaños/aniversario. Sharp no soporta @font-face embebido con datos
// base64 de forma confiable, así que en su lugar se registran como fuentes
// "del sistema" vía un fontconfig.conf temporal que apunta a la carpeta de
// fuentes del proyecto. El directorio de caché tiene que ser escribible,
// por eso se usa /tmp (el único disco escribible en Vercel).
import path from 'path';
import fs from 'fs';

let configurado = false;

function configurarFuentes() {
  if (configurado) return;

  const dirFuentes = path.join(process.cwd(), 'lib', 'fonts');
  const cacheDir = '/tmp/qdc-fontconfig-cache';
  const confPath = '/tmp/qdc-fonts.conf';

  fs.mkdirSync(cacheDir, { recursive: true });

  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dirFuentes}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`;
  fs.writeFileSync(confPath, conf);
  process.env.FONTCONFIG_FILE = confPath;
  configurado = true;
}

export { configurarFuentes };
