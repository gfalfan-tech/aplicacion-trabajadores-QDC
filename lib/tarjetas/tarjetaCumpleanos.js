// Construye el SVG de la tarjeta de cumpleaños para un tema (1-20) y un
// nombre dados. El SVG resultante se rasteriza a PNG con sharp (ver
// app/api/cron/celebraciones/route.js).
import * as M from './motivos.js';

const ANCHO = 1600;
const ALTO = 1132;

function escaparXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fondoWash(colorA, colorB, id) {
  return `
  <defs>
    <linearGradient id="grad-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}"/>
      <stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <radialGradient id="glow-${id}" cx="50%" cy="0%" r="80%">
      <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#grad-${id})"/>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#glow-${id})"/>
  <rect x="18" y="18" width="${ANCHO - 36}" height="${ALTO - 36}" fill="none" stroke="white" stroke-width="3" opacity="0.6" rx="18"/>`;
}

function logoQdc(logoBase64) {
  return `<image href="data:image/png;base64,${logoBase64}" x="55" y="46" width="150" height="66.5" opacity="0.85"/>`;
}

function tituloYNombre(nombre, colorTitulo, colorAcento) {
  const tam = nombre.length > 20 ? 74 : nombre.length > 15 ? 86 : 100;
  return `
  <g text-anchor="middle">
    <text x="${ANCHO / 2}" y="420" font-family="Baloo 2 ExtraBold" font-size="92" fill="white" stroke="${colorTitulo}" stroke-width="14" stroke-linejoin="round">FELIZ</text>
    <text x="${ANCHO / 2}" y="420" font-family="Baloo 2 ExtraBold" font-size="92" fill="white">FELIZ</text>
    <text x="${ANCHO / 2}" y="530" font-family="Baloo 2 ExtraBold" font-size="92" fill="white" stroke="${colorTitulo}" stroke-width="14" stroke-linejoin="round">CUMPLEA&#209;OS</text>
    <text x="${ANCHO / 2}" y="530" font-family="Baloo 2 ExtraBold" font-size="92" fill="white">CUMPLEA&#209;OS</text>
    <text x="${ANCHO / 2}" y="650" font-family="Caveat" font-weight="700" font-size="${tam}" fill="${colorAcento}">${escaparXml(nombre)}</text>
    <text x="${ANCHO / 2}" y="720" font-family="Baloo 2 SemiBold" font-size="30" fill="#334155">Los colaboradores de QDC te desean</text>
    <text x="${ANCHO / 2}" y="762" font-family="Baloo 2 SemiBold" font-size="30" fill="#334155">un muy lindo d&#237;a. &#161;Felicidades!</text>
  </g>`;
}

/**
 * @param {object} tema - uno de los 20 temas de construirTemasCumpleanos()
 * @param {string} nombre - "Primer nombre Primer apellido" (ver lib/nombreCorto.js)
 * @param {string} logoBase64 - contenido de public/qdc-logo.png en base64
 */
function construirSvgCumpleanos(tema, nombre, logoBase64) {
  const { fondoA, fondoB, colorTitulo, colorAcento, motivoPrincipal, motivoSecundario, guirnalda } = tema;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  ${fondoWash(fondoA, fondoB, tema.id)}
  ${logoQdc(logoBase64)}
  ${M.guirnaldaEstrellas(420, 110, 1180, 110, guirnalda, 7)}
  ${motivoPrincipal}
  ${motivoSecundario}
  ${tituloYNombre(nombre, colorTitulo, colorAcento)}
</svg>`;
}

export { construirSvgCumpleanos, ANCHO, ALTO };
