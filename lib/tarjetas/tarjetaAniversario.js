import * as M from './motivos.js';
const ANCHO = 1600, ALTO = 1132;

function escaparXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function medallaAnios(cx, cy, anios, color) {
  const r = 110;
  const texto = String(anios);
  const tamNum = texto.length > 2 ? 78 : 96;
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="3 10" opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${color}" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 16}" fill="none" stroke="${color}" stroke-width="3" opacity="0.5"/>
    <text x="${cx}" y="${cy + tamNum * 0.33}" text-anchor="middle" font-family="Baloo 2 ExtraBold" font-size="${tamNum}" fill="${color}">${texto}</text>
    <text x="${cx}" y="${cy + r - 26}" text-anchor="middle" font-family="Baloo 2 SemiBold" font-size="24" fill="${color}">A&#209;OS</text>
    <path d="M ${cx - 34} ${cy + r + 6} l -22 60 l 26 -10 l 14 22 l 18 -58 Z" fill="${color}" opacity="0.9"/>
    <path d="M ${cx + 34} ${cy + r + 6} l 22 60 l -26 -10 l -14 22 l -18 -58 Z" fill="${color}" opacity="0.9"/>
  </g>`;
}

function fondoWash(colorA, colorB) {
  return `
  <defs>
    <linearGradient id="gradA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}"/>
      <stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <radialGradient id="glowA" cx="50%" cy="0%" r="80%">
      <stop offset="0%" stop-color="white" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#gradA)"/>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#glowA)"/>
  <rect x="18" y="18" width="${ANCHO - 36}" height="${ALTO - 36}" fill="none" stroke="white" stroke-width="3" opacity="0.6" rx="18"/>`;
}

function logoQdc(logoBase64) {
  return `<image href="data:image/png;base64,${logoBase64}" x="55" y="46" width="150" height="66.5" opacity="0.85"/>`;
}

function construirSvgAniversario(nombre, anios, logoBase64) {
  const colorTitulo = '#8a6400';
  const colorAcento = '#153A5B';
  const colorMedalla = '#c2870b';
  const tam = nombre.length > 20 ? 68 : nombre.length > 15 ? 78 : 90;
  const plural = anios === 1 ? 'a&#241;o' : 'a&#241;os';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  ${fondoWash('#fff8e6', '#ffffff')}
  ${logoQdc(logoBase64)}
  ${M.guirnaldaEstrellas(420, 110, 1180, 110, '#f6c343', 7)}
  ${M.copaTrofeo(230, 900, colorMedalla, 1.7)}
  ${M.chispas(1390, 300, '#f6a623', 1.2)}
  ${M.confeti(1380, 950, ['#f6a623', '#146c43', '#0F5C8C', '#c65bcf'], 1.05)}
  <g text-anchor="middle">
    <text x="${ANCHO / 2 - 190}" y="345" font-family="Baloo 2 ExtraBold" font-size="70" fill="white" stroke="${colorTitulo}" stroke-width="11" stroke-linejoin="round">FELIZ</text>
    <text x="${ANCHO / 2 - 190}" y="345" font-family="Baloo 2 ExtraBold" font-size="70" fill="white">FELIZ</text>
    <text x="${ANCHO / 2 - 190}" y="420" font-family="Baloo 2 ExtraBold" font-size="70" fill="white" stroke="${colorTitulo}" stroke-width="11" stroke-linejoin="round">ANIVERSARIO</text>
    <text x="${ANCHO / 2 - 190}" y="420" font-family="Baloo 2 ExtraBold" font-size="70" fill="white">ANIVERSARIO</text>
    <text x="${ANCHO / 2 - 190}" y="530" font-family="Caveat" font-weight="700" font-size="${tam}" fill="${colorAcento}">${escaparXml(nombre)}</text>
    <text x="${ANCHO / 2 - 190}" y="600" font-family="Baloo 2 SemiBold" font-size="28" fill="#334155">Hoy celebra ${anios} ${plural} como</text>
    <text x="${ANCHO / 2 - 190}" y="638" font-family="Baloo 2 SemiBold" font-size="28" fill="#334155">parte del equipo QDC.</text>
    <text x="${ANCHO / 2 - 190}" y="690" font-family="Baloo 2 SemiBold" font-size="28" fill="#334155">&#161;Gracias por tu compromiso</text>
    <text x="${ANCHO / 2 - 190}" y="728" font-family="Baloo 2 SemiBold" font-size="28" fill="#334155">y dedicaci&#243;n!</text>
  </g>
  ${medallaAnios(1330, 640, anios, colorMedalla)}
</svg>`;
}

export { construirSvgAniversario };
