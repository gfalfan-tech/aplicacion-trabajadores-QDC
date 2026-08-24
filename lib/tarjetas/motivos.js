// Librería de motivos decorativos (ilustraciones simples, estilo amigable
// con doble trazo) reutilizados y combinados entre las 20 plantillas.

function trazoDoble(pathD, colorLinea, colorRelleno, grosor = 7) {
  return `<path d="${pathD}" fill="${colorRelleno || 'none'}" stroke="${colorLinea}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Globo individual con hilo ondulado
function globo(cx, cy, color, escala = 1, hiloLargo = 160) {
  const rx = 46 * escala, ry = 58 * escala;
  return `
  <g>
    ${trazoDoble(`M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 -${rx * 2} 0`, color, 'white', 6 * escala)}
    <path d="M ${cx} ${cy + ry - 4 * escala} L ${cx - 5 * escala} ${cy + ry + 8 * escala} L ${cx + 4 * escala} ${cy + ry + 14 * escala} Z" fill="${color}"/>
    <path d="M ${cx} ${cy + ry + 14 * escala} q 14 ${hiloLargo * 0.3} -6 ${hiloLargo * 0.55} q -16 ${hiloLargo * 0.25} 8 ${hiloLargo}" fill="none" stroke="${color}" stroke-width="${2.5 * escala}" opacity="0.55"/>
    <ellipse cx="${cx - rx * 0.35}" cy="${cy - ry * 0.4}" rx="${rx * 0.22}" ry="${ry * 0.14}" fill="white" opacity="0.55" transform="rotate(-25 ${cx - rx * 0.35} ${cy - ry * 0.4})"/>
  </g>`;
}

function racimoGlobos(cx, cy, colores, escala = 1) {
  const offsets = [
    { dx: -70, dy: 10, s: 0.85 },
    { dx: 0, dy: -35, s: 1 },
    { dx: 70, dy: 15, s: 0.9 },
    { dx: -20, dy: 70, s: 0.72 },
    { dx: 45, dy: 85, s: 0.68 },
  ];
  return offsets
    .map((o, i) => globo(cx + o.dx * escala, cy + o.dy * escala, colores[i % colores.length], o.s * escala, 220))
    .join('\n');
}

// Guirnalda de banderines con estrellas colgando, estilo el ejemplo de referencia
function guirnaldaEstrellas(x1, y1, x2, y2, color, nEstrellas = 6) {
  const midY = Math.min(y1, y2) - 60;
  const path = `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${midY} ${x2} ${y2}`;
  let estrellas = '';
  for (let i = 1; i < nEstrellas; i++) {
    const t = i / nEstrellas;
    const x = x1 + (x2 - x1) * t;
    const yBase = y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * (y1 - midY + 60);
    const y = yBase + 26;
    estrellas += estrella(x, y, 13 - (i % 2) * 3, color, 0.9);
  }
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" opacity="0.5" stroke-dasharray="2 10" stroke-linecap="round"/>${estrellas}`;
}

function estrella(cx, cy, r, color, opacity = 1) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a1 = (Math.PI / 2) + i * ((2 * Math.PI) / 5);
    const a2 = a1 + Math.PI / 5;
    pts.push([cx + r * Math.cos(a1), cy - r * Math.sin(a1)]);
    pts.push([cx + (r * 0.42) * Math.cos(a2), cy - (r * 0.42) * Math.sin(a2)]);
  }
  const d = 'M ' + pts.map((p) => p.join(' ')).join(' L ') + ' Z';
  return `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
}

function torta(cx, cy, color, escala = 1) {
  const w = 190 * escala, h = 90 * escala;
  return `
  <g>
    ${trazoDoble(`M ${cx - w / 2} ${cy} q 0 -14 12 -14 h ${w - 24} q 12 0 12 14 v ${h * 0.55} h -${w} Z`, color, 'white', 6 * escala)}
    ${trazoDoble(`M ${cx - w / 2} ${cy + h * 0.55} h ${w} v ${h * 0.55} q 0 14 -14 14 h -${w - 28} q -14 0 -14 -14 Z`, color, 'white', 6 * escala)}
    <path d="M ${cx - w / 2} ${cy + 8} q ${w / 6} -14 ${w / 3} 0 q ${w / 6} 14 ${w / 3} 0 q ${w / 6} -14 ${w / 3} 0" fill="none" stroke="${color}" stroke-width="${5 * escala}" stroke-linecap="round"/>
    ${[0.22, 0.5, 0.78]
      .map(
        (fx) => `
      <line x1="${cx - w / 2 + w * fx}" y1="${cy - 42 * escala}" x2="${cx - w / 2 + w * fx}" y2="${cy - 8 * escala}" stroke="#7a5230" stroke-width="${4 * escala}" stroke-linecap="round"/>
      <path d="M ${cx - w / 2 + w * fx} ${cy - 42 * escala} q -6 -14 0 -22 q 6 8 0 22" fill="#f6a623" stroke="#e08a12" stroke-width="1.5"/>`
      )
      .join('')}
  </g>`;
}

function regalo(cx, cy, color, escala = 1) {
  const w = 130 * escala, h = 110 * escala;
  return `
  <g>
    ${trazoDoble(`M ${cx - w / 2} ${cy - h / 2 + 14} h ${w} v ${h - 14} h -${w} Z`, color, 'white', 6 * escala)}
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="20 * escala" fill="none"/>
    ${trazoDoble(`M ${cx - w / 2 - 6} ${cy - h / 2} h ${w + 12} v 26 h -${w + 12} Z`, color, 'white', 6 * escala)}
    <line x1="${cx}" y1="${cy - h / 2 - 4}" x2="${cx}" y2="${cy + h / 2 - 10}" stroke="${color}" stroke-width="${6 * escala}"/>
    <path d="M ${cx} ${cy - h / 2} q -30 -34 -46 -6 q -8 20 46 6" fill="none" stroke="${color}" stroke-width="${5 * escala}" stroke-linecap="round"/>
    <path d="M ${cx} ${cy - h / 2} q 30 -34 46 -6 q 8 20 -46 6" fill="none" stroke="${color}" stroke-width="${5 * escala}" stroke-linecap="round"/>
  </g>`;
}

function gorroFiesta(cx, cy, color, escala = 1) {
  const w = 90 * escala, h = 130 * escala;
  return `
  <g>
    ${trazoDoble(`M ${cx - w / 2} ${cy + h / 2} L ${cx} ${cy - h / 2} L ${cx + w / 2} ${cy + h / 2} Z`, color, 'white', 6 * escala)}
    ${estrella(cx - 10 * escala, cy - h * 0.1, 8 * escala, color)}
    ${estrella(cx + 14 * escala, cy + h * 0.15, 6 * escala, color)}
    <circle cx="${cx}" cy="${cy - h / 2}" r="${11 * escala}" fill="${color}"/>
    <path d="M ${cx - w / 2} ${cy + h / 2} q ${w / 2} 22 ${w} 0" fill="none" stroke="${color}" stroke-width="${5 * escala}" stroke-linecap="round"/>
  </g>`;
}

function chispas(cx, cy, color, escala = 1) {
  return `
  <g opacity="0.85">
    ${estrella(cx, cy, 16 * escala, color)}
    ${estrella(cx + 60 * escala, cy - 30 * escala, 9 * escala, color)}
    ${estrella(cx - 55 * escala, cy + 20 * escala, 11 * escala, color)}
    ${estrella(cx + 20 * escala, cy + 55 * escala, 7 * escala, color)}
    <circle cx="${cx - 90 * escala}" cy="${cy - 10 * escala}" r="${5 * escala}" fill="${color}"/>
    <circle cx="${cx + 90 * escala}" cy="${cy + 40 * escala}" r="${6 * escala}" fill="${color}"/>
  </g>`;
}

function confeti(cx, cy, colores, escala = 1) {
  const formas = [];
  const rand = (seed) => {
    const x = Math.sin(seed * 999) * 10000;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 22; i++) {
    const ang = rand(i) * Math.PI * 2;
    const dist = 40 + rand(i + 50) * 150;
    const x = cx + Math.cos(ang) * dist * escala;
    const y = cy + Math.sin(ang) * dist * escala * 0.7;
    const c = colores[i % colores.length];
    if (i % 3 === 0) {
      formas.push(`<circle cx="${x}" cy="${y}" r="${5 * escala}" fill="${c}"/>`);
    } else if (i % 3 === 1) {
      formas.push(`<rect x="${x - 5 * escala}" y="${y - 5 * escala}" width="${10 * escala}" height="${10 * escala}" fill="${c}" transform="rotate(${rand(i) * 90} ${x} ${y})"/>`);
    } else {
      formas.push(estrella(x, y, 7 * escala, c));
    }
  }
  return `<g>${formas.join('')}</g>`;
}

function flor(cx, cy, color, escala = 1) {
  const petalo = (ang) => {
    const rad = (ang * Math.PI) / 180;
    const x = cx + Math.cos(rad) * 26 * escala;
    const y = cy + Math.sin(rad) * 26 * escala;
    return `<ellipse cx="${x}" cy="${y}" rx="${16 * escala}" ry="${22 * escala}" fill="${color}" opacity="0.85" transform="rotate(${ang} ${x} ${y})"/>`;
  };
  return `<g>${[0, 72, 144, 216, 288].map(petalo).join('')}<circle cx="${cx}" cy="${cy}" r="${12 * escala}" fill="#ffd76b"/></g>`;
}

function ramoFlores(cx, cy, colores, escala = 1) {
  const offs = [
    { dx: -40, dy: 10 },
    { dx: 30, dy: -20 },
    { dx: 0, dy: -50 },
    { dx: 50, dy: 30 },
  ];
  return offs.map((o, i) => flor(cx + o.dx * escala, cy + o.dy * escala, colores[i % colores.length], escala * 0.9)).join('');
}

function lunaEstrellas(cx, cy, color, escala = 1) {
  return `
  <g>
    ${trazoDoble(`M ${cx + 30 * escala} ${cy - 40 * escala} a 40 40 0 1 0 0 80 a 32 32 0 1 1 0 -80`, color, 'white', 6 * escala)}
    ${estrella(cx - 55 * escala, cy - 30 * escala, 10 * escala, color)}
    ${estrella(cx - 30 * escala, cy + 35 * escala, 7 * escala, color)}
    ${estrella(cx - 75 * escala, cy + 10 * escala, 6 * escala, color)}
  </g>`;
}

function cometa(cx, cy, color, escala = 1) {
  return `
  <g>
    ${trazoDoble(`M ${cx} ${cy - 55 * escala} L ${cx + 45 * escala} ${cy} L ${cx} ${cy + 55 * escala} L ${cx - 45 * escala} ${cy} Z`, color, 'white', 6 * escala)}
    <line x1="${cx}" y1="${cy - 55 * escala}" x2="${cx}" y2="${cy + 55 * escala}" stroke="${color}" stroke-width="${3 * escala}" opacity="0.5"/>
    <path d="M ${cx} ${cy + 55 * escala} q 10 30 -8 55 q -14 20 6 45" fill="none" stroke="${color}" stroke-width="${3 * escala}" opacity="0.55"/>
    ${[0.3, 0.55, 0.8].map((t) => `<path d="M ${cx - 10} ${cy + 55 * escala + 100 * t * escala} l -14 8 l 4 -16 Z" fill="${color}" opacity="0.7"/>`).join('')}
  </g>`;
}

function copaTrofeo(cx, cy, color, escala = 1) {
  return `
  <g>
    ${trazoDoble(`M ${cx - 30 * escala} ${cy - 40 * escala} h ${60 * escala} v ${20 * escala} q 0 30 -30 34 q -30 -4 -30 -34 Z`, color, 'white', 6 * escala)}
    ${trazoDoble(`M ${cx - 30 * escala} ${cy - 36 * escala} q -22 0 -22 16 q 0 18 22 18`, color, 'none', 5 * escala)}
    ${trazoDoble(`M ${cx + 30 * escala} ${cy - 36 * escala} q 22 0 22 16 q 0 18 -22 18`, color, 'none', 5 * escala)}
    <rect x="${cx - 8 * escala}" y="${cy + 14 * escala}" width="${16 * escala}" height="${18 * escala}" fill="${color}"/>
    <rect x="${cx - 26 * escala}" y="${cy + 32 * escala}" width="${52 * escala}" height="${12 * escala}" rx="4" fill="${color}"/>
  </g>`;
}

function rayoSol(cx, cy, color, escala = 1) {
  let rayos = '';
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI * 2) / 10;
    const x1 = cx + Math.cos(ang) * 46 * escala;
    const y1 = cy + Math.sin(ang) * 46 * escala;
    const x2 = cx + Math.cos(ang) * 72 * escala;
    const y2 = cy + Math.sin(ang) * 72 * escala;
    rayos += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${6 * escala}" stroke-linecap="round"/>`;
  }
  return `<g>${rayos}${trazoDoble(`M ${cx - 40 * escala} ${cy} a 40 40 0 1 0 80 0 a 40 40 0 1 0 -80 0`, color, 'white', 6 * escala)}</g>`;
}

function cintaBandera(x1, y, x2, colores, escala = 1) {
  const n = 8;
  const step = (x2 - x1) / n;
  let out = `<path d="M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + 34 * escala} ${x2} ${y}" fill="none" stroke="#94a3b8" stroke-width="2.5" opacity="0.5"/>`;
  for (let i = 0; i < n; i++) {
    const cx = x1 + step * (i + 0.5);
    const t = (i + 0.5) / n;
    const cy = y + Math.sin(t * Math.PI) * 34 * escala + 10;
    const c = colores[i % colores.length];
    out += `<path d="M ${cx - 16 * escala} ${cy} h ${32 * escala} l -${16 * escala} ${28 * escala} Z" fill="${c}"/>`;
  }
  return out;
}

function hojas(cx, cy, color, escala = 1) {
  const hoja = (ang, len) => {
    const rad = (ang * Math.PI) / 180;
    const x2 = cx + Math.cos(rad) * len * escala;
    const y2 = cy + Math.sin(rad) * len * escala;
    return trazoDoble(`M ${cx} ${cy} Q ${cx + Math.cos(rad) * len * 0.5 * escala + 20} ${cy + Math.sin(rad) * len * 0.5 * escala} ${x2} ${y2}`, color, 'none', 5 * escala);
  };
  return `<g>${[200, 230, 260, 290, 320].map((a) => hoja(a, 90)).join('')}</g>`;
}

function corazones(cx, cy, color, escala = 1) {
  const corazon = (x, y, s) =>
    `<path d="M ${x} ${y + 10 * s} C ${x - 22 * s} ${y - 14 * s} ${x - 6 * s} ${y - 30 * s} ${x} ${y - 12 * s} C ${x + 6 * s} ${y - 30 * s} ${x + 22 * s} ${y - 14 * s} ${x} ${y + 10 * s} Z" fill="${color}" opacity="0.85"/>`;
  return `<g>${corazon(cx, cy, escala)}${corazon(cx + 46 * escala, cy + 20 * escala, escala * 0.65)}${corazon(cx - 40 * escala, cy + 24 * escala, escala * 0.55)}</g>`;
}

function velasNumero(cx, cy, color, escala = 1) {
  return `
  <g>
    <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 60 * escala}" stroke="#7a5230" stroke-width="${8 * escala}" stroke-linecap="round"/>
    <path d="M ${cx} ${cy - 60 * escala} q -8 -16 0 -26 q 8 10 0 26" fill="#f6a623" stroke="#e08a12" stroke-width="1.5"/>
  </g>`;
}

export {
  globo,
  racimoGlobos,
  guirnaldaEstrellas,
  estrella,
  torta,
  regalo,
  gorroFiesta,
  chispas,
  confeti,
  flor,
  ramoFlores,
  lunaEstrellas,
  cometa,
  copaTrofeo,
  rayoSol,
  cintaBandera,
  hojas,
  corazones,
};
