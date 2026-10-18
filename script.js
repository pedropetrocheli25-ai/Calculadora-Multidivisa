'use strict';

/* =====================================================================
   CALCULADORA MULTIDIVISA PRO
   ===================================================================== */

const PAISES = ['Perú', 'Venezuela', 'Colombia', 'Brasil'];

const SIMBOLOS = { 'Perú': 'S/', 'Venezuela': 'Bs', 'Colombia': 'COP $', 'Brasil': 'R$' };

const TASAS_DEFAULT = {
    'peru-venezuela': 271.10, 'venezuela-peru': 285.50,
    'colombia-venezuela': 0.010, 'venezuela-colombia': 100.00,
    'brasil-venezuela': 7.50, 'venezuela-brasil': 0.133,
    'peru-colombia': 1050.00, 'colombia-peru': 0.00095,
    'peru-brasil': 1.45, 'brasil-peru': 0.69,
    'colombia-brasil': 0.0014, 'brasil-colombia': 720.00
};

const ZONA_VE = 'America/Caracas';
const REFRESCO_NORMAL_MS = 60 * 1000;        // consulta cada minuto
const REFRESCO_PUBLICACION_MS = 20 * 1000;   // cada 20 s cuando el BCV suele publicar (3 pm a 8 pm)
const TIMEOUT_MS = 8000;

/* ---------------------------------------------------------------------
   Almacenamiento seguro (nunca rompe la app si localStorage falla)
   --------------------------------------------------------------------- */
const store = {
    get(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin espacio o bloqueado */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
    getJSON(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (e) { return def; } }
};

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------------
   Estado
   --------------------------------------------------------------------- */
let tasasLocales = cargarTasasLocales();
let bcvUsdManual = parseFloat(store.get('bcvUsdManual')) || 0;
let bcvEurManual = parseFloat(store.get('bcvEurManual')) || 0;

const bcv = {
    usd: { tasa: 0, fecha: null },
    eur: { tasa: 0, fecha: null },
    fuente: '',
    obtenidoEn: null,   // milisegundos (Date.now) de la última consulta exitosa
    desdeCache: false,
    error: false,
    cargando: false
};

function cargarTasasLocales() {
    const guardadas = store.getJSON('tasasLocales', {});
    const base = (guardadas && typeof guardadas === 'object') ? guardadas : {};
    Object.keys(TASAS_DEFAULT).forEach(k => {
        const v = parseFloat(base[k]);
        if (!(v > 0)) base[k] = TASAS_DEFAULT[k];
    });
    return base;
}

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */
const normalizar = (texto) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const obtenerClave = (origen, destino) => `${normalizar(origen)}-${normalizar(destino)}`;

function redondearAlSiguienteDiez(val) {
    if (isNaN(val) || !isFinite(val) || val <= 0) return 0;
    return Math.ceil(Number(val.toFixed(2)) * 10) / 10;
}

// Si hay Perú de por medio se redondea hacia arriba a 0.10; si no, a 2 decimales
function redondearSegunPais(valor, origen, destino) {
    if (origen === 'Perú' || destino === 'Perú') return redondearAlSiguienteDiez(valor);
    return Math.round(valor * 100) / 100;
}

// Número con formato venezolano: 1.234,56
function num(valor, decimales = 2) {
    if (isNaN(valor) || !isFinite(valor)) valor = 0;
    const partes = Math.abs(valor).toFixed(decimales).split('.');
    const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const signo = valor < 0 ? '-' : '';
    return decimales > 0 ? `${signo}${entero},${partes[1]}` : `${signo}${entero}`;
}

function formatearMoneda(monto, pais) {
    if (isNaN(monto) || !isFinite(monto)) monto = 0;
    const simbolo = SIMBOLOS[pais] || 'Bs';
    const decimales = (pais === 'Colombia') ? (monto % 1 === 0 ? 0 : 2) : 2;
    return `${simbolo} ${num(monto, decimales)}`;
}

function formatearTasa(t) {
    if (isNaN(t) || !isFinite(t)) return '0';
    const dec = t >= 1 ? 2 : (t >= 0.01 ? 3 : 5);
    // Quita ceros sobrantes pero deja mínimo 2 decimales (271,10 · 0,01 · 0,00095)
    return num(t, dec).replace(/(,\d{2}\d*?)0+$/, '$1');
}

function obtenerTasaActiva(origen, destino) {
    if (normalizar(origen) === normalizar(destino)) return 1;
    const clave = obtenerClave(origen, destino);
    return parseFloat(tasasLocales[clave]) || parseFloat(TASAS_DEFAULT[clave]) || 1;
}

function obtenerNombreEmpresa() {
    return (store.get('nombreEmpresa', '') || '').trim().toUpperCase();
}

function tasaBCVActiva(moneda) {
    if (moneda === 'EUR') return bcvEurManual > 0 ? bcvEurManual : bcv.eur.tasa;
    return bcvUsdManual > 0 ? bcvUsdManual : bcv.usd.tasa;
}

/* Fechas (siempre en hora de Venezuela) */
function fechaVE(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_VE }).format(d); // YYYY-MM-DD
}

function aFechaISO(v) {
    if (!v || typeof v !== 'string') return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return v.trim();
    m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(v);
    return isNaN(d) ? null : fechaVE(d);
}

function fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}

function horaCorta(ms) {
    return new Date(ms).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit', timeZone: ZONA_VE });
}

// ¿Estamos en el horario en que el BCV suele publicar la tasa del siguiente día hábil?
function enVentanaDePublicacion() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_VE, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
    const dia = p.find(x => x.type === 'weekday')?.value;
    const hora = parseInt(p.find(x => x.type === 'hour')?.value, 10) % 24;
    return !['Sat', 'Sun'].includes(dia) && hora >= 15 && hora < 20;
}

/* ---------------------------------------------------------------------
   Avisos emergentes
   --------------------------------------------------------------------- */
function mostrarToast(mensaje, tipo = 'ok') {
    const wrap = $('toastWrap');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = mensaje;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => {
        t.classList.remove('visible');
        setTimeout(() => t.remove(), 300);
    }, 2400);
}

/* ---------------------------------------------------------------------
   Menú lateral y vistas
   --------------------------------------------------------------------- */
function abrirDrawer() {
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('drawerOverlay').classList.add('active');
    $('hamburgerBtn').setAttribute('aria-expanded', 'true');
}

function cerrarDrawer() {
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('drawerOverlay').classList.remove('active');
    $('hamburgerBtn').setAttribute('aria-expanded', 'false');
}

function cambiarVista(vista) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('activa'));
    $(`view-${vista}`).classList.add('activa');

    document.querySelectorAll('.drawer-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-view="${vista}"]`)?.classList.add('active');

    cerrarDrawer();

    if (vista === 'configuracion') {
        renderTablaEditor();
        cargarCamposConfiguracion();
        actualizarIndicadoresBCV();
    }
    window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------------
   Cálculo
   --------------------------------------------------------------------- */
function leerContexto() {
    const origen = $('origen')?.value || 'Perú';
    const destino = $('destino')?.value || 'Venezuela';
    const operacion = $('operacion')?.value || 'dividir';
    const monedaBCV = $('monedaBCV')?.value || 'USD';
    const monto = parseFloat($('monto')?.value) || 0;
    const bcvDeseado = parseFloat($('montoBCVDeseado')?.value) || 0;

    const tasa = obtenerTasaActiva(origen, destino);
    const tasaBCV = tasaBCVActiva(monedaBCV);

    // Casos en que el monto escrito está en la moneda de DESTINO (se calcula cuánto enviar):
    //   Venezuela → Perú multiplicando: escribes los soles que quieres que reciban
    //   Perú → Venezuela dividiendo:    escribes los Bs que quieres que reciban
    const vpMult = origen === 'Venezuela' && destino === 'Perú' && operacion === 'multiplicar';
    const pvDiv = origen === 'Perú' && destino === 'Venezuela' && operacion === 'dividir';
    const montoEnDestino = vpMult || pvDiv;

    const resultadoCalculado = operacion === 'dividir' ? (tasa > 0 ? monto / tasa : 0) : monto * tasa;
    const resultado = redondearSegunPais(resultadoCalculado, origen, destino);

    return {
        origen, destino, operacion, monedaBCV, monto, bcvDeseado, tasa, tasaBCV,
        simBCV: monedaBCV === 'EUR' ? '€' : '$',
        nomBCV: monedaBCV === 'EUR' ? 'EUR' : 'USD',
        simOrigen: SIMBOLOS[origen] || '',
        involucraVE: origen === 'Venezuela' || destino === 'Venezuela',
        vpMult, pvDiv, montoEnDestino,
        resultado,
        monedaResultado: montoEnDestino ? origen : destino
    };
}

// Total en bolívares que representa la operación (para la equivalencia BCV)
function totalBsOperacion(c) {
    if (c.vpMult) return c.resultado;            // Bs que se deben enviar
    if (c.pvDiv) return c.monto;                 // Bs que recibe el destinatario
    if (c.destino === 'Venezuela') return c.resultado;
    if (c.origen === 'Venezuela') return c.monto;
    return 0;
}

// Cuando el usuario pide recibir un monto exacto en USD/EUR (equivalente BCV)
function calcularDesdeBCV(c) {
    const bs = c.bcvDeseado * c.tasaBCV;
    const bsRedondeado = Math.round(bs * 100) / 100;
    const directo = (v) => c.operacion === 'dividir' ? (c.tasa > 0 ? v / c.tasa : 0) : v * c.tasa;

    if (c.destino === 'Venezuela') {
        // Los Bs son lo que se recibe → se calcula cuánto enviar desde el origen
        let enviar;
        if (c.pvDiv || c.operacion === 'multiplicar') enviar = c.tasa > 0 ? bs / c.tasa : 0;
        else enviar = bs * c.tasa;
        return {
            enviar: redondearSegunPais(enviar, c.origen, c.destino), monedaEnviar: c.origen,
            recibe: bsRedondeado, monedaRecibe: 'Venezuela', bs: bsRedondeado
        };
    }
    // Origen Venezuela: los Bs son lo que se envía → se calcula lo que recibe el destino
    const recibe = c.vpMult ? (c.tasa > 0 ? bs / c.tasa : 0) : directo(bs);
    return {
        enviar: bsRedondeado, monedaEnviar: 'Venezuela',
        recibe: redondearSegunPais(recibe, c.origen, c.destino), monedaRecibe: c.destino, bs: bsRedondeado
    };
}

function ejecutarCalculo() {
    const c = leerContexto();

    // Etiqueta del monto
    const lbl = $('lblMonto');
    if (lbl) {
        if (c.vpMult) lbl.textContent = 'Soles deseados a recibir en Perú (S/)';
        else if (c.pvDiv) lbl.textContent = 'Bs que debe recibir el destinatario (Bs)';
        else lbl.textContent = `Monto a Enviar / Convertir (${c.simOrigen})`;
    }

    // Resultado principal
    const resEl = $('resultado');
    if (resEl) {
        const ocultar = c.monto === 0 && c.bcvDeseado > 0 && c.tasaBCV > 0;
        resEl.hidden = ocultar;
        if (!ocultar) resEl.textContent = formatearMoneda(c.resultado, c.monedaResultado);
    }

    const tasaInfo = $('tasaInfo');
    if (tasaInfo) tasaInfo.textContent = `Tasa actual (${c.origen} → ${c.destino}): ${formatearTasa(c.tasa)}`;

    // Sección BCV
    const bcvSection = $('bcvSection');
    const equivEl = $('bcvEquivalencia');
    if (bcvSection) bcvSection.hidden = !c.involucraVE;

    if (equivEl) {
        if (!c.involucraVE) {
            equivEl.hidden = true;
        } else if (!(c.tasaBCV > 0)) {
            equivEl.hidden = false;
            equivEl.textContent = bcv.error ? '(No se pudo cargar la tasa BCV)' : '(Cargando equivalente BCV…)';
        } else {
            const partes = [];
            const totalBs = totalBsOperacion(c);
            if (c.monto > 0 && totalBs > 0) {
                partes.push(`<div>≈ ${c.simBCV} ${num(totalBs / c.tasaBCV)} ${c.nomBCV} BCV</div>`);
            }
            if (c.bcvDeseado > 0) {
                const d = calcularDesdeBCV(c);
                const borde = partes.length ? ' class="bcv-calc con-borde"' : ' class="bcv-calc"';
                if (c.origen === 'Venezuela') {
                    partes.push(`<div${borde}>Para enviar <strong>${c.simBCV} ${num(c.bcvDeseado)} ${c.nomBCV}</strong> debe pagar:<br>` +
                        `<span class="bcv-calc-grande">Bs ${num(d.enviar)}</span> ` +
                        `<small>(recibe ${formatearMoneda(d.recibe, d.monedaRecibe)})</small></div>`);
                } else {
                    partes.push(`<div${borde}>Para recibir <strong>${c.simBCV} ${num(c.bcvDeseado)} ${c.nomBCV}</strong> debe enviar:<br>` +
                        `<span class="bcv-calc-grande">${formatearMoneda(d.enviar, d.monedaEnviar)}</span> ` +
                        `<small>(Bs ${num(d.bs)})</small></div>`);
                }
            }
            equivEl.innerHTML = partes.join('');
            equivEl.hidden = partes.length === 0;
        }
    }

    actualizarTablaCruzada();
}

function generarTextoCotizacion() {
    const c = leerContexto();
    const empresa = obtenerNombreEmpresa();
    const titulo = empresa ? ` ${empresa}` : '';
    const linea = '-----------------------------------\n';
    const filaDeA = `➖ *De:* ${c.origen} ➔ *A:* ${c.destino}\n`;

    let txt = `💸 *COTIZACIÓN${titulo}* \n${linea}`;

    if (c.monto > 0) {
        if (c.montoEnDestino) {
            txt += `➖ *Debe Enviar:* ${formatearMoneda(c.resultado, c.origen)}\n`;
            txt += `➖ *Para recibir:* ${formatearMoneda(c.monto, c.destino)}\n`;
        } else {
            txt += `➖ *Enviar:* ${formatearMoneda(c.monto, c.origen)}\n`;
        }
        txt += filaDeA;
        txt += `➖ *Tasa:* ${formatearTasa(c.tasa)}\n`;
        if (!c.montoEnDestino) txt += `➖ *Recibe:* ${formatearMoneda(c.resultado, c.destino)}\n`;

        const totalBs = totalBsOperacion(c);
        if (c.involucraVE && c.tasaBCV > 0 && totalBs > 0) {
            txt += `➖ *Equivalente BCV:* ${c.simBCV} ${num(totalBs / c.tasaBCV)} ${c.nomBCV} (Tasa: Bs ${num(c.tasaBCV)})\n`;
        }
    } else if (c.bcvDeseado > 0 && c.tasaBCV > 0 && c.involucraVE) {
        const d = calcularDesdeBCV(c);
        if (c.origen === 'Venezuela') {
            txt += `➖ *Enviando:* ${c.simBCV} ${num(c.bcvDeseado)} ${c.nomBCV}\n`;
            txt += filaDeA;
            txt += `➖ *Tasa de cambio:* ${formatearTasa(c.tasa)}\n`;
            txt += `➖ *Tasa BCV:* Bs ${num(c.tasaBCV)}\n`;
            txt += `➖ *Debe Enviar:* Bs ${num(d.enviar)}\n`;
            txt += `➖ *Recibe:* ${formatearMoneda(d.recibe, d.monedaRecibe)}\n`;
        } else {
            txt += `➖ *Para recibir:* ${c.simBCV} ${num(c.bcvDeseado)} ${c.nomBCV}\n`;
            txt += filaDeA;
            txt += `➖ *Tasa de cambio:* ${formatearTasa(c.tasa)}\n`;
            txt += `➖ *Tasa BCV:* Bs ${num(c.tasaBCV)}\n`;
            txt += `➖ *Debe Enviar:* ${formatearMoneda(d.enviar, d.monedaEnviar)}\n`;
            txt += `➖ *Recibe en Bs:* ${formatearMoneda(d.recibe, 'Venezuela')}\n`;
        }
    } else {
        txt += filaDeA;
        txt += `➖ *Tasa:* ${formatearTasa(c.tasa)}\n`;
    }

    txt += linea;
    txt += '¡Gracias por tu preferencia! 🙏';
    return txt;
}

/* ---------------------------------------------------------------------
   Tabla de tasas cruzadas (vista calculadora)
   --------------------------------------------------------------------- */
function actualizarTablaCruzada() {
    const cont = $('tablaTasasContent');
    if (!cont) return;
    const origenSel = $('origen')?.value;
    const destinoSel = $('destino')?.value;
    cont.innerHTML = '';
    PAISES.forEach(o => PAISES.forEach(d => {
        if (o === d) return;
        const tr = document.createElement('tr');
        if (o === origenSel && d === destinoSel) tr.className = 'fila-actual';
        [o, d, formatearTasa(obtenerTasaActiva(o, d))].forEach((txt, i) => {
            const td = document.createElement('td');
            td.textContent = txt;
            if (i === 2) td.className = 'num';
            tr.appendChild(td);
        });
        cont.appendChild(tr);
    }));
}

/* ---------------------------------------------------------------------
   Configuración
   --------------------------------------------------------------------- */
function renderTablaEditor() {
    const tbody = $('listaTasasEditables');
    if (!tbody) return;
    tbody.innerHTML = '';
    PAISES.forEach(o => PAISES.forEach(d => {
        if (o === d) return;
        const clave = obtenerClave(o, d);
        const tr = document.createElement('tr');

        const tdRuta = document.createElement('td');
        tdRuta.textContent = `${o} → ${d}`;

        const tdTasa = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.min = '0';
        input.inputMode = 'decimal';
        input.dataset.clave = clave;
        input.value = parseFloat(tasasLocales[clave]) || TASAS_DEFAULT[clave];
        input.setAttribute('aria-label', `Tasa ${o} a ${d}`);
        tdTasa.appendChild(input);

        tr.append(tdRuta, tdTasa);
        tbody.appendChild(tr);
    }));
}

function cargarCamposConfiguracion() {
    const nombre = $('nombreEmpresa');
    if (nombre) nombre.value = store.get('nombreEmpresa', '') || '';
    const u = $('bcvUsdManual'); if (u) u.value = bcvUsdManual > 0 ? bcvUsdManual : '';
    const e = $('bcvEurManual'); if (e) e.value = bcvEurManual > 0 ? bcvEurManual : '';
}

function guardarCamposSimples() {
    store.set('nombreEmpresa', ($('nombreEmpresa')?.value || '').trim());

    bcvUsdManual = parseFloat($('bcvUsdManual')?.value) || 0;
    bcvEurManual = parseFloat($('bcvEurManual')?.value) || 0;
    if (bcvUsdManual > 0) store.set('bcvUsdManual', String(bcvUsdManual)); else store.remove('bcvUsdManual');
    if (bcvEurManual > 0) store.set('bcvEurManual', String(bcvEurManual)); else store.remove('bcvEurManual');

    renderBCV();
}

function guardarTodasLasTasas() {
    const inputs = document.querySelectorAll('#listaTasasEditables input[data-clave]');
    const nuevas = { ...tasasLocales };
    let invalidas = 0;
    inputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (v > 0) {
            nuevas[inp.dataset.clave] = v;
            inp.classList.remove('invalido');
        } else {
            invalidas++;
            inp.classList.add('invalido');
        }
    });
    if (invalidas > 0) {
        mostrarToast(`Hay ${invalidas} tasa(s) vacía(s) o inválida(s). Revísalas.`, 'error');
        return;
    }
    tasasLocales = nuevas;
    store.set('tasasLocales', JSON.stringify(tasasLocales));
    guardarCamposSimples();
    ejecutarCalculo();
    mostrarToast('Configuración guardada ✔');
}

function restaurarValoresPredeterminados() {
    if (!confirm('¿Restaurar las tasas entre países y las tasas BCV manuales a sus valores originales?')) return;
    store.remove('tasasLocales');
    store.remove('bcvUsdManual');
    store.remove('bcvEurManual');
    tasasLocales = cargarTasasLocales();
    bcvUsdManual = 0;
    bcvEurManual = 0;
    renderTablaEditor();
    cargarCamposConfiguracion();
    renderBCV();
    mostrarToast('Valores restaurados ✔');
}

/* ---------------------------------------------------------------------
   TASA BCV EN TIEMPO REAL
   Orden de prioridad:
     1) /api/bcv  → tu propia función que lee bcv.org.ve directamente (sin retraso)
     2) APIs públicas de respaldo (pydolarve, dolarapi). Si responden distinto, se usa
        la que tenga la FECHA VALOR más reciente.
   --------------------------------------------------------------------- */
async function pedirJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(t);
    }
}

async function fuenteBCVPropia() {
    const d = await pedirJSON('/api/bcv');
    const usd = parseFloat(d?.usd);
    const eur = parseFloat(d?.eur);
    if (!(usd > 0) || !(eur > 0)) throw new Error('Respuesta inválida de /api/bcv');
    const fecha = aFechaISO(d.fechaValor);
    return { fuente: 'BCV', usd: { tasa: usd, fecha }, eur: { tasa: eur, fecha } };
}

function leerPyDolar(d) {
    const m = d?.monitors;
    const x = m?.usd || m?.eur || m?.bcv || (m ? Object.values(m)[0] : null);
    const tasa = parseFloat(x?.price);
    return tasa > 0 ? { tasa, fecha: aFechaISO(x?.last_update) } : null;
}

async function fuentePyDolar() {
    const [u, e] = await Promise.allSettled([
        pedirJSON('https://pydolarve.org/api/v1/dollar?page=bcv'),
        pedirJSON('https://pydolarve.org/api/v1/euro?page=bcv')
    ]);
    return {
        fuente: 'PyDolarVE',
        usd: u.status === 'fulfilled' ? leerPyDolar(u.value) : null,
        eur: e.status === 'fulfilled' ? leerPyDolar(e.value) : null
    };
}

function leerDolarApi(d) {
    const tasa = parseFloat(d?.promedio);
    return tasa > 0 ? { tasa, fecha: aFechaISO(d?.fechaActualizacion) } : null;
}

async function fuenteDolarApi() {
    const [u, e] = await Promise.allSettled([
        pedirJSON('https://ve.dolarapi.com/v1/dolares/oficial'),
        pedirJSON('https://ve.dolarapi.com/v1/euros/oficial')
    ]);
    return {
        fuente: 'DolarApi',
        usd: u.status === 'fulfilled' ? leerDolarApi(u.value) : null,
        eur: e.status === 'fulfilled' ? leerDolarApi(e.value) : null
    };
}

// Elige, por moneda, el dato con la fecha valor más reciente (en empate, gana el de mayor prioridad)
function elegirMejor(resultados) {
    const mejor = (moneda) => {
        let elegido = null;
        resultados.forEach(r => {
            const dato = r[moneda];
            if (!dato) return;
            if (!elegido || (dato.fecha || '') > (elegido.dato.fecha || '')) elegido = { dato, fuente: r.fuente };
        });
        return elegido;
    };
    return { usd: mejor('usd'), eur: mejor('eur') };
}

async function obtenerTasasBCV() {
    try {
        const propia = await fuenteBCVPropia();
        return { usd: { ...propia.usd }, eur: { ...propia.eur }, fuente: propia.fuente };
    } catch (e) {
        console.log('Fuente propia no disponible, usando respaldos…', e.message);
    }

    const respuestas = await Promise.allSettled([fuentePyDolar(), fuenteDolarApi()]);
    const ok = respuestas.filter(r => r.status === 'fulfilled').map(r => r.value);
    const { usd, eur } = elegirMejor(ok);
    if (!usd && !eur) throw new Error('Ninguna fuente respondió');

    const fuentes = [...new Set([usd?.fuente, eur?.fuente].filter(Boolean))].join(' + ');
    return { usd: usd ? usd.dato : null, eur: eur ? eur.dato : null, fuente: fuentes };
}

function guardarCacheBCV() {
    store.set('bcvCache', JSON.stringify({ usd: bcv.usd, eur: bcv.eur, fuente: bcv.fuente, obtenidoEn: bcv.obtenidoEn }));
}

function cargarCacheBCV() {
    const c = store.getJSON('bcvCache', null);
    if (!c || !(c.usd?.tasa > 0) || !(c.eur?.tasa > 0)) return false;
    bcv.usd = c.usd;
    bcv.eur = c.eur;
    bcv.fuente = c.fuente || '';
    bcv.obtenidoEn = c.obtenidoEn || null;
    bcv.desdeCache = true;
    return true;
}

let bcvTimer = null;
let consultandoBCV = false;

async function consultarBCV({ silencioso = false } = {}) {
    if (consultandoBCV) return;
    consultandoBCV = true;
    bcv.cargando = !silencioso;
    if (!silencioso) renderBCV();

    try {
        const r = await obtenerTasasBCV();
        const antes = { usd: bcv.usd.tasa, eur: bcv.eur.tasa, fechaUsd: bcv.usd.fecha };
        if (r.usd) bcv.usd = r.usd;
        if (r.eur) bcv.eur = r.eur;
        bcv.fuente = r.fuente;
        bcv.obtenidoEn = Date.now();
        bcv.desdeCache = false;
        bcv.error = false;
        guardarCacheBCV();

        // Aviso cuando aparece una tasa nueva mientras la app está abierta
        if (antes.usd > 0 && (antes.usd !== bcv.usd.tasa || antes.eur !== bcv.eur.tasa)) {
            mostrarToast(`Nueva tasa BCV: USD Bs ${num(bcv.usd.tasa)} · EUR Bs ${num(bcv.eur.tasa)}`);
        }
    } catch (e) {
        console.warn('No se pudo actualizar la tasa BCV:', e.message);
        bcv.error = true;
    } finally {
        consultandoBCV = false;
        bcv.cargando = false;
        renderBCV();
    }
}

function programarActualizacionBCV() {
    clearTimeout(bcvTimer);
    const espera = enVentanaDePublicacion() ? REFRESCO_PUBLICACION_MS : REFRESCO_NORMAL_MS;
    bcvTimer = setTimeout(async () => {
        if (!document.hidden) await consultarBCV({ silencioso: true });
        programarActualizacionBCV();
    }, espera);
}

/* Pintar tasas BCV en pantalla */
function pintarTarjetaBCV(idValor, idBadge, dato, manual) {
    const valorEl = $(idValor);
    const badge = $(idBadge);
    if (!valorEl || !badge) return;

    const tasa = manual > 0 ? manual : dato.tasa;
    if (tasa > 0) {
        valorEl.textContent = `Bs ${num(tasa)}`;
        valorEl.classList.remove('cargando');
    } else {
        valorEl.textContent = bcv.error ? 'No disponible' : 'Cargando…';
        valorEl.classList.toggle('cargando', !bcv.error);
    }

    if (manual > 0) {
        badge.textContent = '✏️ Manual';
        badge.className = 'bcv-badge manual';
    } else if (dato.fecha) {
        const hoy = fechaVE(new Date());
        const futura = dato.fecha > hoy;
        badge.textContent = `${futura ? 'Desde' : 'Vigente'} ${fechaCorta(dato.fecha)}`;
        badge.className = 'bcv-badge' + (futura ? ' nueva' : '');
    } else {
        badge.textContent = '';
        badge.className = 'bcv-badge';
    }
}

function renderBCV() {
    pintarTarjetaBCV('bcvUsd', 'bcvUsdBadge', bcv.usd, bcvUsdManual);
    pintarTarjetaBCV('bcvEur', 'bcvEurBadge', bcv.eur, bcvEurManual);

    const btn = $('btnRefrescarBCV');
    if (btn) btn.classList.toggle('girando', bcv.cargando);

    const est = $('bcvEstado');
    if (est) {
        let punto = 'ok', texto;
        if (bcv.cargando) { punto = 'espera'; texto = 'Actualizando…'; }
        else if (bcv.error && !bcv.obtenidoEn) { punto = 'error'; texto = 'Sin conexión. Toca ↻ para reintentar'; }
        else if (bcv.error) { punto = 'espera'; texto = `Sin conexión. Última tasa a las ${horaCorta(bcv.obtenidoEn)}`; }
        else if (bcv.desdeCache) { punto = 'espera'; texto = `Guardada de ${horaCorta(bcv.obtenidoEn)} · actualizando…`; }
        else if (bcv.obtenidoEn) { texto = `En vivo · ${horaCorta(bcv.obtenidoEn)}${bcv.fuente ? ' · ' + bcv.fuente : ''}`; }
        else { punto = 'espera'; texto = 'Cargando…'; }
        est.innerHTML = `<span class="punto ${punto}"></span>`;
        est.append(document.createTextNode(texto));
    }

    actualizarIndicadoresBCV();
    ejecutarCalculo();
}

function actualizarIndicadoresBCV() {
    const pintar = (idHint, manual) => {
        const h = $(idHint);
        if (!h) return;
        h.textContent = manual > 0 ? 'Usando valor manual' : 'Usando valor automático';
        h.classList.toggle('manual', manual > 0);
    };
    pintar('bcvUsdHint', bcvUsdManual);
    pintar('bcvEurHint', bcvEurManual);
}

/* ---------------------------------------------------------------------
   Compartir / copiar
   --------------------------------------------------------------------- */
function compartirWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(generarTextoCotizacion())}`, '_blank', 'noopener');
}

async function copiarCotizacion() {
    const txt = generarTextoCotizacion();
    try {
        await navigator.clipboard.writeText(txt);
        mostrarToast('Cotización copiada ✔');
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { /* nada */ }
        ta.remove();
        mostrarToast(ok ? 'Cotización copiada ✔' : 'No se pudo copiar', ok ? 'ok' : 'error');
    }
}

/* ---------------------------------------------------------------------
   Eventos e inicio
   --------------------------------------------------------------------- */
function intercambiarPaises() {
    const o = $('origen'), d = $('destino');
    [o.value, d.value] = [d.value, o.value];
    paisesPrevios = { origen: o.value, destino: d.value };
    ejecutarCalculo();
}

// Evita origen = destino: si se elige el mismo país, el otro selector toma el valor anterior
let paisesPrevios = { origen: 'Venezuela', destino: 'Perú' };

function evitarMismoPais(cambiado) {
    const o = $('origen'), d = $('destino');
    if (o.value === d.value) {
        if (cambiado === 'origen') d.value = paisesPrevios.origen;
        else o.value = paisesPrevios.destino;
    }
    paisesPrevios = { origen: o.value, destino: d.value };
}

function alternarTablaTasas() {
    const tabla = $('tablaTasas');
    const btn = $('verTasasBtn');
    const abrir = tabla.hidden;
    tabla.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? 'Ocultar tabla de tasas' : 'Ver tabla de tasas';
    if (abrir) actualizarTablaCruzada();
}

function iniciar() {
    // Menú
    $('hamburgerBtn').addEventListener('click', abrirDrawer);
    $('drawerOverlay').addEventListener('click', cerrarDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarDrawer(); });
    document.querySelectorAll('.drawer-item').forEach(b => b.addEventListener('click', () => cambiarVista(b.dataset.view)));

    // Calculadora
    ['monto', 'montoBCVDeseado'].forEach(id => $(id).addEventListener('input', ejecutarCalculo));
    ['operacion', 'monedaBCV'].forEach(id => $(id).addEventListener('change', ejecutarCalculo));
    $('origen').addEventListener('change', () => { evitarMismoPais('origen'); ejecutarCalculo(); });
    $('destino').addEventListener('change', () => { evitarMismoPais('destino'); ejecutarCalculo(); });
    $('swapBtn').addEventListener('click', intercambiarPaises);
    $('btnWhatsapp').addEventListener('click', compartirWhatsApp);
    $('btnCopiarTransaccion').addEventListener('click', copiarCotizacion);
    $('verTasasBtn').addEventListener('click', alternarTablaTasas);

    // Tarjetas BCV: tocar = actualizar
    const refrescar = () => consultarBCV();
    ['cardUsd', 'cardEur'].forEach(id => {
        const el = $(id);
        el.addEventListener('click', refrescar);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); refrescar(); } });
    });
    $('btnRefrescarBCV').addEventListener('click', refrescar);

    // Configuración
    $('nombreEmpresa').addEventListener('change', guardarCamposSimples);
    $('bcvUsdManual').addEventListener('change', guardarCamposSimples);
    $('bcvEurManual').addEventListener('change', guardarCamposSimples);
    $('btnGuardarTodasLasTasas').addEventListener('click', guardarTodasLasTasas);
    $('btnResetConfig').addEventListener('click', restaurarValoresPredeterminados);

    // Tasa BCV: mostrar la guardada al instante y luego pedir la nueva
    cargarCacheBCV();
    renderBCV();
    consultarBCV();
    programarActualizacionBCV();

    // Al volver a la app o recuperar internet, se actualiza de inmediato
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { consultarBCV({ silencioso: true }); programarActualizacionBCV(); } });
    window.addEventListener('online', () => consultarBCV());
    window.addEventListener('focus', () => consultarBCV({ silencioso: true }));
}

document.addEventListener('DOMContentLoaded', iniciar);