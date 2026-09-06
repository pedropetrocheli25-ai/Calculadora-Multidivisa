const SHEET_ID = '1JKBGVPGPRCKIQsj1MpEvNLylxx29eCU6iFLGYAJ0qnA'; 
const API_URL_PRIMARY = `https://opensheet.elk.sh/${SHEET_ID}/Hoja1`;
const API_URL_FALLBACK = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let TASAS_MANUALES = [];
let TASAS_BCV = { USD: 0, EUR: 0 };

// ⏱️ Petición con tiempo límite (evita que el código se quede colgado esperando)
async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// 🔢 Redondeo a favor del negocio (al siguiente 0.10)
function redondearAFavor(valor) {
    if (!valor || isNaN(valor) || valor === 0) return 0;
    const valorAjustado = Math.round(valor * 10000) / 10000;
    return Math.ceil(valorAjustado * 10) / 10;
}

// 🏛️ OBTENER BCV EN TIEMPO REAL CON MÚLTIPLES RESPALDOS
async function obtenerBCV() {
    const timestamp = Date.now();
    let usd = 0;
    let eur = 0;

    // 1. Intento primario: CDN DolarVZLA (Respuesta ultra rápida)
    try {
        const res = await fetchWithTimeout(`https://rates.dolarvzla.com/bcv/current.json?_t=${timestamp}`, { cache: 'no-store' }, 3500);
        if (res.ok) {
            const data = await res.json();
            if (data && data.current) {
                usd = parseFloat(data.current.usd || 0);
                eur = parseFloat(data.current.eur || 0);
            }
        }
    } catch (e) {
        console.warn('DolarVZLA no respondió, intentando DolarApi...', e);
    }

    // 2. Intento secundario: DolarApi
    if (usd === 0) {
        try {
            const [resUSD, resEUR] = await Promise.all([
                fetchWithTimeout(`https://ve.dolarapi.com/v1/dolares/oficial?_t=${timestamp}`, { cache: 'no-store' }, 3500).then(r => r.json()),
                fetchWithTimeout(`https://ve.dolarapi.com/v1/euros/oficial?_t=${timestamp}`, { cache: 'no-store' }, 3500).then(r => r.json())
            ]);
            usd = parseFloat(resUSD.promedio || resUSD.monto || 0);
            eur = parseFloat(resEUR.promedio || resEUR.monto || 0);
        } catch (e) {
            console.warn('DolarApi no respondió, intentando PyDolarVenezuela...', e);
        }
    }

    // 3. Intento terciario: PyDolarVenezuela
    if (usd === 0) {
        try {
            const res = await fetchWithTimeout(`https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv&_t=${timestamp}`, { cache: 'no-store' }, 3500);
            if (res.ok) {
                const data = await res.json();
                if (data && data.monedas) {
                    usd = parseFloat(data.monedas.usd?.promedio || data.monedas.usd?.monto || 0);
                    eur = parseFloat(data.monedas.eur?.promedio || data.monedas.eur?.monto || 0);
                }
            }
        } catch (e) {
            console.error('Error cargando BCV:', e);
        }
    }

    if (usd > 0) {
        TASAS_BCV.USD = usd;
        TASAS_BCV.EUR = eur || usd;

        const bcvUsdEl = document.getElementById('bcvUsd');
        const bcvEurEl = document.getElementById('bcvEur');
        if (bcvUsdEl) bcvUsdEl.textContent = `${TASAS_BCV.USD.toFixed(2)} Bs`;
        if (bcvEurEl) bcvEurEl.textContent = `${TASAS_BCV.EUR.toFixed(2)} Bs`;

        calcular();
        generarTarifario();
    } else {
        const bcvUsdEl = document.getElementById('bcvUsd');
        const bcvEurEl = document.getElementById('bcvEur');
        if (bcvUsdEl) bcvUsdEl.textContent = 'Error';
        if (bcvEurEl) bcvEurEl.textContent = 'Error';
    }
}

// 📊 Lógica directa de respaldo con Google Sheets
async function obtenerTasasDesdeGoogleDirecto() {
    const timestamp = Date.now();
    const res = await fetchWithTimeout(`${API_URL_FALLBACK}&_t=${timestamp}`, { cache: 'no-store' }, 4000);
    const text = await res.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);

    const cols = data.table.cols.map(c => c ? (c.label || c.id) : '');
    const rows = data.table.rows;

    return rows.map(r => {
        const item = {};
        if (r.c) {
            r.c.forEach((cell, idx) => {
                const key = cols[idx] ? cols[idx].trim() : `col_${idx}`;
                item[key] = cell ? (cell.v !== null ? cell.v : '') : '';
            });
        }
        return item;
    });
}

// 📥 Cargar Tasas desde Google Sheet
async function obtenerTasas() {
    const tasaInfo = document.getElementById('tasaInfo');
    if (tasaInfo) tasaInfo.innerHTML = 'Obteniendo tasas...';

    let datos = null;
    const timestamp = Date.now();

    // Intento 1: OpenSheet
    try {
        const respuesta = await fetchWithTimeout(`${API_URL_PRIMARY}?_t=${timestamp}`, { cache: 'no-store' }, 3500);
        if (respuesta.ok) {
            datos = await respuesta.json();
        }
    } catch (e) {
        console.warn('OpenSheet no respondió, intentando conexión directa con Google...', e);
    }

    // Intento 2: Google Directo
    if (!datos || !Array.isArray(datos) || datos.length === 0) {
        try {
            datos = await obtenerTasasDesdeGoogleDirecto();
        } catch (e) {
            console.error('Error cargando tasas desde API directa:', e);
        }
    }

    if (datos && Array.isArray(datos) && datos.length > 0) {
        TASAS_MANUALES = datos.map(item => ({
            origen: item.Origen ? item.Origen.toString().trim() : '',
            destino: item.Destino ? item.Destino.toString().trim() : '',
            tasa: item.Tasa ? parseFloat(item.Tasa.toString().replace(',', '.')) : 0,
            monedaMult: item.MonedaMult ? item.MonedaMult.toString().trim() : '',
            monedaDiv: item.MonedaDiv ? item.MonedaDiv.toString().trim() : ''
        })).filter(t => t.origen && t.destino);

        calcular();
        generarTarifario();
    } else {
        if (tasaInfo) tasaInfo.innerHTML = '⚠️ Error al cargar las tasas. Revisa tu Google Sheet.';
    }
}

// 🧮 FUNCIÓN PRINCIPAL DE CÁLCULO (Adaptada a tus IDs exactos)
function calcular() {
    if (TASAS_MANUALES.length === 0) return;

    const elOrigen = document.getElementById('origen');
    const elDestino = document.getElementById('destino');
    const elMonto = document.getElementById('monto');
    const elOperacion = document.getElementById('operacion');

    if (!elOrigen || !elDestino) return;

    const origen = elOrigen.value;
    const destino = elDestino.value;
    const montoInput = elMonto ? (parseFloat(elMonto.value) || 0) : 0;
    const operacion = elOperacion ? elOperacion.value : 'multiplicar';

    const bcvSection = document.getElementById('bcvSection');
    const bcvEquivalencia = document.getElementById('bcvEquivalencia');
    const esVenezuelaInvolucrado = (origen === 'Venezuela' || destino === 'Venezuela');

    if (bcvSection) {
        bcvSection.style.display = esVenezuelaInvolucrado ? 'block' : 'none';
        if (esVenezuelaInvolucrado && TASAS_BCV.USD === 0) {
            obtenerBCV();
        }
    } else if (bcvEquivalencia && !esVenezuelaInvolucrado) {
        bcvEquivalencia.style.display = 'none';
    }

    const infoTasa = TASAS_MANUALES.find(t => t.origen === origen && t.destino === destino);
    const tasaInfo = document.getElementById('tasaInfo');
    const elResultado = document.getElementById('resultado');

    if (!infoTasa) {
        if (tasaInfo) tasaInfo.innerHTML = `Sin tasa configurada para <strong>${origen} → ${destino}</strong>`;
        if (elResultado) elResultado.textContent = '---';
        if (bcvEquivalencia) bcvEquivalencia.style.display = 'none';
        return;
    }

    const tasaCruzada = infoTasa.tasa;
    if (tasaInfo) {
        tasaInfo.innerHTML = `Tasa ${origen} → ${destino}: <strong>${tasaCruzada.toLocaleString('es-ES')}</strong>`;
    }

    const elMonedaBCV = document.getElementById('monedaBCV');
    const elMontoBCVDeseado = document.getElementById('montoBCVDeseado');

    const monedaBCV = elMonedaBCV ? elMonedaBCV.value : 'USD';
    const tasaBCV = TASAS_BCV[monedaBCV] || 0;
    const montoBCVDeseado = elMontoBCVDeseado ? (parseFloat(elMontoBCVDeseado.value) || 0) : 0;

    let resultado = 0;
    let moneda = '';
    const lblResultadoTitle = document.getElementById('lblResultadoTitle');

    if (esVenezuelaInvolucrado && montoBCVDeseado > 0 && tasaBCV > 0) {
        const bsRequeridos = redondearAFavor(montoBCVDeseado * tasaBCV);

        if (destino === 'Venezuela') {
            resultado = bsRequeridos;
            moneda = 'Bs';
            if (lblResultadoTitle) lblResultadoTitle.textContent = `Bolívares requeridos (para $${montoBCVDeseado} ${monedaBCV} BCV)`;

            let montoOrigenNecesario = (operacion === 'multiplicar') ? (bsRequeridos / tasaCruzada) : (bsRequeridos * tasaCruzada);
            montoOrigenNecesario = redondearAFavor(montoOrigenNecesario);

            if (bcvEquivalencia) {
                bcvEquivalencia.style.display = 'block';
                bcvEquivalencia.innerHTML = `💵 Para recibir <strong>$${montoBCVDeseado} ${monedaBCV}</strong> en Venezuela (Tasa BCV: ${tasaBCV.toFixed(2)} Bs), deben enviar: <strong>${montoOrigenNecesario.toFixed(2)} ${origen === 'Perú' ? 'S/' : 'en moneda de ' + origen}</strong>.`;
            }
        } else if (origen === 'Venezuela') {
            resultado = bsRequeridos;
            moneda = 'Bs';
            if (lblResultadoTitle) lblResultadoTitle.textContent = `Bolívares a enviar (equivalentes a $${montoBCVDeseado} ${monedaBCV} BCV)`;

            let montoDestinoRecibido = (operacion === 'multiplicar') ? (bsRequeridos * tasaCruzada) : (bsRequeridos / tasaCruzada);
            montoDestinoRecibido = redondearAFavor(montoDestinoRecibido);

            if (bcvEquivalencia) {
                bcvEquivalencia.style.display = 'block';
                bcvEquivalencia.innerHTML = `💵 $${montoBCVDeseado} ${monedaBCV} equivalen a <strong>${bsRequeridos.toFixed(2)} Bs</strong>. Al cambiarlos a ${destino}, recibirás: <strong>${montoDestinoRecibido.toFixed(2)} ${destino === 'Perú' ? 'S/' : 'en moneda de ' + destino}</strong>.`;
            }
        }
    } else {
        if (operacion === 'multiplicar') {
            resultado = montoInput * tasaCruzada;
            moneda = infoTasa.monedaMult;
            if (lblResultadoTitle) lblResultadoTitle.textContent = 'Resultado (Monto × Tasa)';
        } else {
            resultado = tasaCruzada !== 0 ? montoInput / tasaCruzada : 0;
            moneda = infoTasa.monedaDiv;
            if (lblResultadoTitle) lblResultadoTitle.textContent = 'Resultado (Monto ÷ Tasa)';
        }

        resultado = redondearAFavor(resultado);

        if (bcvEquivalencia) {
            if (esVenezuelaInvolucrado && tasaBCV > 0) {
                bcvEquivalencia.style.display = 'block';

                if (moneda === 'Bs') {
                    const equivalenciaUSD = redondearAFavor(resultado / tasaBCV);
                    bcvEquivalencia.innerHTML = `🏛️ Equivalente BCV: <strong>$${equivalenciaUSD.toFixed(2)} ${monedaBCV}</strong> (Tasa: ${tasaBCV.toFixed(2)} Bs)`;
                } else if (origen === 'Venezuela') {
                    const equivalenciaUSD = redondearAFavor(montoInput / tasaBCV);
                    bcvEquivalencia.innerHTML = `🏛️ Los ${montoInput} Bs enviados equivalen a <strong>$${equivalenciaUSD.toFixed(2)} ${monedaBCV}</strong> según tasa oficial BCV (${tasaBCV.toFixed(2)} Bs).`;
                } else {
                    bcvEquivalencia.style.display = 'none';
                }
            } else {
                bcvEquivalencia.style.display = 'none';
            }
        }
    }

    if (elResultado) {
        const resFormateado = resultado.toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        elResultado.textContent = `${moneda} ${resFormateado}`;
    }
}

// 📋 LÓGICA DEL TARIFARIO DINÁMICO
function generarTarifario() {
    const elTipo = document.getElementById('tipoTarifario');
    const contenedor = document.getElementById('contenedorTarifario');
    const header = document.getElementById('headerTarifario');
    const thead = document.getElementById('theadTarifario');
    const tbody = document.getElementById('tbodyTarifario');

    if (!elTipo || !contenedor) return;

    const tipo = elTipo.value;
    if (tipo === 'ninguno') {
        contenedor.style.display = 'none';
        return;
    }

    const infoPeruVen = TASAS_MANUALES.find(t => t.origen === 'Perú' && t.destino === 'Venezuela');
    const tasaPeruVen = infoPeruVen ? infoPeruVen.tasa : 0;
    const tasaBCV = TASAS_BCV.USD || 0;

    if (tasaPeruVen === 0 || tasaBCV === 0) {
        if (header) header.innerHTML = '⚠️ Cargando datos de tasas para tarifario...';
        contenedor.style.display = 'block';
        if (thead) thead.innerHTML = '';
        if (tbody) tbody.innerHTML = '';
        return;
    }

    contenedor.style.display = 'block';

    const htmlCuadrosTasas = `
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 12px; margin-bottom: 5px;">
            <div style="background-color: #1b3b22; border: 1.5px solid #2ecc71; border-radius: 8px; padding: 8px 12px; text-align: center; flex: 1;">
                <div style="font-size: 11px; color: #a3e4d7; font-weight: bold; margin-bottom: 2px;">Tasa BCV</div>
                <div style="font-size: 14px; color: #2ecc71; font-weight: bold;">${tasaBCV.toFixed(2)} Bs</div>
            </div>
            <div style="background-color: #1a2938; border: 1.5px solid #3498db; border-radius: 8px; padding: 8px 12px; text-align: center; flex: 1;">
                <div style="font-size: 11px; color: #a9cce3; font-weight: bold; margin-bottom: 2px;">Tasa PE-VE</div>
                <div style="font-size: 14px; color: #3498db; font-weight: bold;">${tasaPeruVen.toLocaleString('es-ES')}</div>
            </div>
        </div>
    `;

    if (tipo === 'soles') {
        if (header) header.innerHTML = `📋 <strong>TARIFARIO SOLES</strong>` + htmlCuadrosTasas;
        if (thead) thead.innerHTML = `<tr><th>Enviado</th><th>Recibes (Bs)</th><th>Equivalente</th></tr>`;

        const montosSoles = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000];
        let htmlRows = '';

        montosSoles.forEach(monto => {
            const recibesBs = redondearAFavor(monto * tasaPeruVen);
            const equivUSD = redondearAFavor(recibesBs / tasaBCV);
            htmlRows += `<tr>
                <td>${monto} S/</td>
                <td>${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${equivUSD.toFixed(2)}$</td>
            </tr>`;
        });
        if (tbody) tbody.innerHTML = htmlRows;

    } else if (tipo === 'usd') {
        if (header) header.innerHTML = `📋 <strong>TARIFARIO EN USD</strong>` + htmlCuadrosTasas;
        if (thead) thead.innerHTML = `<tr><th>Dólares</th><th>Recibes (Bs)</th><th>Equivalente</th></tr>`;

        const montosUSD = [5, 10, 20, 50, 100, 150, 200, 500];
        let htmlRows = '';

        montosUSD.forEach(monto => {
            const recibesBs = redondearAFavor(monto * tasaBCV);
            const equivSoles = redondearAFavor(recibesBs / tasaPeruVen);

            htmlRows += `<tr>
                <td>${monto}$</td>
                <td>${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${equivSoles.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} S/</td>
            </tr>`;
        });
        if (tbody) tbody.innerHTML = htmlRows;
    }
}

// 📱 COMPARTIR Y COPIAR CÁLCULOS
function obtenerTextoCotizacion() {
    const origen = document.getElementById('origen')?.value || '';
    const destino = document.getElementById('destino')?.value || '';
    const monto = document.getElementById('monto')?.value || '';
    const resultadoText = document.getElementById('resultado')?.textContent || '';
    const tasaInfoText = document.getElementById('tasaInfo')?.innerText || '';
    const bcvEquiv = document.getElementById('bcvEquivalencia');

    let mensaje = `💸 *COTIZACIÓN DE REMESA*\n`;
    mensaje += `-----------------------------------\n`;
    mensaje += `🌎 *Ruta:* ${origen} ➔ ${destino}\n`;
    mensaje += `💰 *Monto ingresado:* ${monto}\n`;
    mensaje += `📊 *Tasa:* ${tasaInfoText}\n`;
    mensaje += `-----------------------------------\n`;
    mensaje += `🎯 *RESULTADO FINAL:* *${resultadoText}*\n`;

    if (bcvEquiv && bcvEquiv.style.display !== 'none' && bcvEquiv.innerText.trim() !== '') {
        mensaje += `\n${bcvEquiv.innerText}\n`;
    }

    mensaje += `-----------------------------------\n`;
    mensaje += `📱 _Enviado desde Calculadora Multidivisa_`;

    return mensaje;
}

function enviarWhatsApp() {
    const mensaje = obtenerTextoCotizacion();
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`, '_blank');
}

async function copiarReciboTransaccion() {
    const mensaje = obtenerTextoCotizacion();
    try {
        await navigator.clipboard.writeText(mensaje);
        const btn = document.getElementById('btnCopiarTransaccion');
        if (btn) {
            const textoOriginal = btn.textContent;
            btn.textContent = '✅ ¡Cálculo Copiado!';
            setTimeout(() => { btn.textContent = textoOriginal; }, 2500);
        }
    } catch (err) {
        alert('No se pudo copiar automáticamente.');
    }
}

function intercambiarPaises() {
    const origen = document.getElementById('origen');
    const destino = document.getElementById('destino');
    if (origen && destino) {
        const temp = origen.value;
        origen.value = destino.value;
        destino.value = temp;
        calcular();
    }
}

function toggleTabla() {
    const tabla = document.getElementById('tablaTasas');
    const btn = document.getElementById('verTasasBtn');
    if (tabla && btn) {
        if (tabla.style.display === 'none') {
            tabla.style.display = 'block';
            btn.textContent = 'Ocultar tabla de tasas';
            cargarTabla();
        } else {
            tabla.style.display = 'none';
            btn.textContent = 'Ver tabla de tasas';
        }
    }
}

function cargarTabla() {
    const content = document.getElementById('tablaTasasContent');
    if (!content) return;
    content.innerHTML = '';
    TASAS_MANUALES.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.origen}</td><td>${t.destino}</td><td>${t.tasa.toLocaleString('es-ES')}</td>`;
        content.appendChild(tr);
    });
}

// 🚀 REGISTRO DE EVENTOS
document.addEventListener('DOMContentLoaded', () => {
    ['origen', 'destino', 'monto', 'operacion', 'monedaBCV', 'montoBCVDeseado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', calcular);
            el.addEventListener('input', calcular);
        }
    });

    document.getElementById('tipoTarifario')?.addEventListener('change', generarTarifario);
    document.getElementById('swapBtn')?.addEventListener('click', intercambiarPaises);
    document.getElementById('verTasasBtn')?.addEventListener('click', toggleTabla);
    document.getElementById('btnWhatsapp')?.addEventListener('click', enviarWhatsApp);
    document.getElementById('btnCopiarTransaccion')?.addEventListener('click', copiarReciboTransaccion);

    obtenerTasas();
});
