// api/bcv.js  ·  Función serverless (Vercel)
// Lee la tasa oficial directamente de bcv.org.ve, en el momento en que el BCV la publica,
// y la entrega como JSON a tu calculadora (sin depender de APIs de terceros que se retrasan).
//
// Respuesta:
// { usd: 881.06, eur: 991.16, fechaValor: "2026-10-19", fuente: "bcv.org.ve", obtenidoEn: "2026-10-17T20:45:00.000Z" }

const https = require('https');

const BCV_URL = 'https://www.bcv.org.ve/';

function pedir(url, inseguro) {
  return new Promise((resolve, reject) => {
    const opciones = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalculadoraMultidivisa/2.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-VE,es;q=0.9'
      },
      timeout: 8000
    };
    // El sitio del BCV suele enviar su certificado SSL incompleto. Solo si falla la
    // verificación normal se reintenta sin verificar, y únicamente para leer datos públicos.
    if (inseguro) opciones.agent = new https.Agent({ rejectUnauthorized: false });

    const req = https.get(url, opciones, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function descargarBCV() {
  try {
    return await pedir(BCV_URL, false);
  } catch (e) {
    return await pedir(BCV_URL, true);
  }
}

function aNumero(texto) {
  if (!texto) return 0;
  let t = String(texto).trim();
  // El BCV usa coma decimal: "881,06130000". Si trae puntos de miles, se quitan.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function leerMoneda(html, id) {
  const inicio = html.indexOf('id="' + id + '"');
  if (inicio < 0) return 0;
  const trozo = html.slice(inicio, inicio + 2000);
  const m = /<strong>\s*([\d.,]+)\s*<\/strong>/i.exec(trozo);
  return m ? aNumero(m[1]) : 0;
}

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function leerFechaValor(html) {
  // 1) Atributo ISO: <span class="date-display-single" content="2026-10-19T00:00:00-04:00">
  let m = /class="date-display-single"[^>]*content="(\d{4}-\d{2}-\d{2})/i.exec(html);
  if (m) return m[1];
  m = /content="(\d{4}-\d{2}-\d{2})T[^"]*"[^>]*class="date-display-single"/i.exec(html);
  if (m) return m[1];
  // 2) Texto: "Fecha Valor: Lunes, 19 Octubre 2026"
  m = /Fecha\s+Valor:?[\s\S]{0,200}?(\d{1,2})\s+([A-Za-zñáéíóú]+)\s+(\d{4})/i.exec(html);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    if (mes) return m[3] + '-' + String(mes).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  return null;
}

function parsearBCV(html) {
  const usd = leerMoneda(html, 'dolar');
  const eur = leerMoneda(html, 'euro');
  const fechaValor = leerFechaValor(html);
  return { usd, eur, fechaValor };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Caché corto en el CDN: casi tiempo real, pero sin golpear al BCV en cada visita.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  try {
    const html = await descargarBCV();
    const { usd, eur, fechaValor } = parsearBCV(html);

    // Validación básica para no entregar datos corruptos si el BCV cambia su página.
    if (!(usd > 1 && usd < 1e6) || !(eur > 1 && eur < 1e6)) {
      throw new Error('No se pudo leer la tasa en la página del BCV');
    }

    res.status(200).json({
      usd,
      eur,
      fechaValor,
      fuente: 'bcv.org.ve',
      obtenidoEn: new Date().toISOString()
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'BCV no disponible', detalle: String(err && err.message || err) });
  }
};

module.exports.parsearBCV = parsearBCV;