const SHEET_ID = '1JKBGVPGPRCKIQsj1MpEvNLylxx29eCU6iFLGYAJ0qnA'; 
const API_URL_PRIMARY = `https://opensheet.elk.sh/${SHEET_ID}/Hoja1`;
const API_URL_FALLBACK = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let TASAS_MANUALES = [];
let TASAS_BCV = { USD: 0, EUR: 0 };

// FUNCIÓN DE REDONDEO ESPECIAL PARA SOLES (S/)
function redondearSoles(valor) {
    if (valor <= 0) return 0;

    const entero = Math.floor(valor);
    const fraccion = Math.round((valor - entero) * 100) / 100;

    if (fraccion === 0) {
        return entero;
    } else if (fraccion <= 0.50) {
        return entero + 0.50;
    } else {
        return entero + 1.00;
    }
}

async function obtenerBCV() {
    try {
        const [resUSD, resEUR] = await Promise.all([
            fetch('https://ve.dolarapi.com/v1/dolares/oficial').then(r => r.json()),
            fetch('https://ve.dolarapi.com/v1/euros/oficial').then(r => r.json())
        ]);

        TASAS_BCV.USD = resUSD.promedio || resUSD.monto || 0;
        TASAS_BCV.EUR = resEUR.promedio || resEUR.monto || 0;

        document.getElementById('bcvUsd').textContent = `${TASAS_BCV.USD.toFixed(2)} Bs`;
        document.getElementById('bcvEur').textContent = `${TASAS_BCV.EUR.toFixed(2)} Bs`;
        calcular();
        generarTarifario();
    } catch (e) {
        console.error('Error cargando BCV principal:', e);
        try {
            const res = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv').then(r => r.json());
            if (res && res.monedas) {
                TASAS_BCV.USD = res.monedas.usd?.promedio || 0;
                TASAS_BCV.EUR = res.monedas.eur?.promedio || 0;
                document.getElementById('bcvUsd').textContent = `${TASAS_BCV.USD.toFixed(2)} Bs`;
                document.getElementById('bcvEur').textContent = `${TASAS_BCV.EUR.toFixed(2)} Bs`;
                calcular();
                generarTarifario();
            }
        } catch(err) {
            document.getElementById('bcvUsd').textContent = 'Error';
            document.getElementById('bcvEur').textContent = 'Error';
        }
    }
}

// Cargar tasas directamente desde Google API (Respaldo oficial)
async function obtenerTasasDesdeGoogleDirecto() {
    const res = await fetch(API_URL_FALLBACK);
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

async function obtenerTasas() {
    const tasaInfo = document.getElementById('tasaInfo');
    tasaInfo.innerHTML = 'Obteniendo tasas...';

    let datos = null;

    try {
        const respuesta = await fetch(API_URL_PRIMARY);
        if (respuesta.ok) {
            datos = await respuesta.json();
        }
    } catch (e) {
        console.warn('OpenSheet no respondió, intentando conexión directa con Google...', e);
    }

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
        tasaInfo.innerHTML = '⚠️ Error al cargar las tasas. Verifica los permisos de tu Google Sheet.';
    }
}

function calcular() {
    if (TASAS_MANUALES.length === 0) return;

    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const montoInput = parseFloat(document.getElementById('monto').value) || 0;
    const operacion = document.getElementById('operacion').value;

    const bcvSection = document.getElementById('bcvSection');
    const bcvEquivalencia = document.getElementById('bcvEquivalencia');
    const esVenezuelaInvolucrado = (origen === 'Venezuela' || destino === 'Venezuela');

    if (esVenezuelaInvolucrado) {
        bcvSection.style.display = 'block';
        if (TASAS_BCV.USD === 0) {
            obtenerBCV();
        }
    } else {
        bcvSection.style.display = 'none';
        bcvEquivalencia.style.display = 'none';
    }

    const infoTasa = TASAS_MANUALES.find(t => t.origen === origen && t.destino === destino);

    if (!infoTasa) {
        document.getElementById('tasaInfo').innerHTML = `Sin tasa configurada para <strong>${origen} → ${destino}</strong>`;
        document.getElementById('resultado').textContent = '---';
        bcvEquivalencia.style.display = 'none';
        return;
    }

    const tasaCruzada = infoTasa.tasa;
    document.getElementById('tasaInfo').innerHTML = `Tasa ${origen} → ${destino}: <strong>${tasaCruzada.toLocaleString('es-ES')}</strong>`;

    const monedaBCV = document.getElementById('monedaBCV').value;
    const tasaBCV = TASAS_BCV[monedaBCV] || 0;
    const montoBCVDeseado = parseFloat(document.getElementById('montoBCVDeseado').value) || 0;

    let resultado = 0;
    let moneda = '';

    if (esVenezuelaInvolucrado && montoBCVDeseado > 0 && tasaBCV > 0) {
        const bsRequeridos = montoBCVDeseado * tasaBCV;

        if (destino === 'Venezuela') {
            resultado = bsRequeridos;
            moneda = 'Bs';
            document.getElementById('lblResultadoTitle').textContent = `Bolívares requeridos (para $${montoBCVDeseado} ${monedaBCV} BCV)`;

            let montoOrigenNecesario = 0;
            if (operacion === 'multiplicar') {
                montoOrigenNecesario = bsRequeridos / tasaCruzada;
            } else {
                montoOrigenNecesario = bsRequeridos * tasaCruzada;
            }

            if (origen === 'Perú') {
                montoOrigenNecesario = redondearSoles(montoOrigenNecesario);
            }

            bcvEquivalencia.style.display = 'block';
            bcvEquivalencia.innerHTML = `💵 Para recibir <strong>$${montoBCVDeseado} ${monedaBCV}</strong> en Venezuela (Tasa BCV: ${tasaBCV.toFixed(2)} Bs), la persona debe enviar: <strong>${montoOrigenNecesario.toFixed(2)} ${origen === 'Perú' ? 'S/' : 'en moneda de ' + origen}</strong>.`;
        } else if (origen === 'Venezuela') {
            resultado = bsRequeridos;
            moneda = 'Bs';
            document.getElementById('lblResultadoTitle').textContent = `Bolívares a enviar (equivalentes a $${montoBCVDeseado} ${monedaBCV} BCV)`;

            let montoDestinoRecibido = 0;
            if (operacion === 'multiplicar') {
                montoDestinoRecibido = bsRequeridos * tasaCruzada;
            } else {
                montoDestinoRecibido = bsRequeridos / tasaCruzada;
            }

            if (destino === 'Perú') {
                montoDestinoRecibido = redondearSoles(montoDestinoRecibido);
            }

            bcvEquivalencia.style.display = 'block';
            bcvEquivalencia.innerHTML = `💵 $${montoBCVDeseado} ${monedaBCV} equivalen a <strong>${bsRequeridos.toFixed(2)} Bs</strong>. Al cambiarlos a ${destino}, recibirás: <strong>${montoDestinoRecibido.toFixed(2)} ${destino === 'Perú' ? 'S/' : 'en moneda de ' + destino}</strong>.`;
        }
    } else {
        if (operacion === 'multiplicar') {
            resultado = montoInput * tasaCruzada;
            moneda = infoTasa.monedaMult;
            document.getElementById('lblResultadoTitle').textContent = 'Resultado (Monto × Tasa)';
        } else {
            resultado = tasaCruzada !== 0 ? montoInput / tasaCruzada : 0;
            moneda = infoTasa.monedaDiv;
            document.getElementById('lblResultadoTitle').textContent = 'Resultado (Monto ÷ Tasa)';
        }

        if (moneda.includes('S/') || moneda.toLowerCase().includes('sol') || destino === 'Perú') {
            resultado = redondearSoles(resultado);
        }

        if (esVenezuelaInvolucrado && tasaBCV > 0) {
            bcvEquivalencia.style.display = 'block';

            if (moneda === 'Bs') {
                const equivalenciaUSD = resultado / tasaBCV;
                bcvEquivalencia.innerHTML = `🏛️ Equivalente BCV: <strong>$${equivalenciaUSD.toFixed(2)} ${monedaBCV}</strong> (Tasa: ${tasaBCV.toFixed(2)} Bs)`;
            } else if (origen === 'Venezuela') {
                const equivalenciaUSD = montoInput / tasaBCV;
                bcvEquivalencia.innerHTML = `🏛️ Los ${montoInput} Bs enviados equivalen a <strong>$${equivalenciaUSD.toFixed(2)} ${monedaBCV}</strong> según tasa oficial BCV (${tasaBCV.toFixed(2)} Bs).`;
            } else {
                bcvEquivalencia.style.display = 'none';
            }
        } else {
            bcvEquivalencia.style.display = 'none';
        }
    }

    const resFormateado = resultado.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    document.getElementById('resultado').textContent = `${moneda} ${resFormateado}`;
}

// LÓGICA DEL TARIFARIO DINÁMICO
function generarTarifario() {
    const tipo = document.getElementById('tipoTarifario').value;
    const contenedor = document.getElementById('contenedorTarifario');
    const header = document.getElementById('headerTarifario');
    const thead = document.getElementById('theadTarifario');
    const tbody = document.getElementById('tbodyTarifario');

    if (tipo === 'ninguno') {
        contenedor.style.display = 'none';
        return;
    }

    const infoPeruVen = TASAS_MANUALES.find(t => t.origen === 'Perú' && t.destino === 'Venezuela');
    const tasaPeruVen = infoPeruVen ? infoPeruVen.tasa : 0;
    const tasaBCV = TASAS_BCV.USD || 0;

    if (tasaPeruVen === 0 || tasaBCV === 0) {
        header.innerHTML = '⚠️ Cargando datos de tasas para tarifario...';
        contenedor.style.display = 'block';
        thead.innerHTML = '';
        tbody.innerHTML = '';
        return;
    }

    contenedor.style.display = 'block';

    if (tipo === 'soles') {
        header.innerHTML = `📋 <strong>TARIFARIO EN SOLES A BOLÍVARES</strong><br>` +
                           `<small>🕐 Tasa BCV: ${tasaBCV.toFixed(2)} Bs | Perú - Ven Configurada: ${tasaPeruVen.toLocaleString('es-ES')}</small>`;

        thead.innerHTML = `<tr><th>Enviado</th><th>Recibes (Bs)</th><th>Equivalente</th></tr>`;

        const montosSoles = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000];
        let htmlRows = '';

        montosSoles.forEach(monto => {
            const recibesBs = monto * tasaPeruVen;
            const equivUSD = recibesBs / tasaBCV;
            htmlRows += `<tr>
                <td>${monto} S/</td>
                <td>${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${equivUSD.toFixed(2)}$</td>
            </tr>`;
        });
        tbody.innerHTML = htmlRows;

    } else if (tipo === 'usd') {
        header.innerHTML = `📋 <strong>TARIFARIO EN USD</strong><br>` +
                           `<small>🕐 Tasa BCV: ${tasaBCV.toFixed(2)} Bs | Perú - Ven Configurada: ${tasaPeruVen.toLocaleString('es-ES')}</small>`;

        thead.innerHTML = `<tr><th>Dólares</th><th>Recibes (Bs)</th><th>Equivalente</th></tr>`;

        const montosUSD = [10, 20, 30, 50, 100, 150, 200, 250, 300, 500];
        let htmlRows = '';

        montosUSD.forEach(monto => {
            const recibesBs = monto * tasaBCV;
            const equivSoles = redondearSoles(recibesBs / tasaPeruVen);

            htmlRows += `<tr>
                <td>${monto}$</td>
                <td>${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${equivSoles.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} S/</td>
            </tr>`;
        });
        tbody.innerHTML = htmlRows;
    }
}

// ENVIAR TARIFARIO POR WHATSAPP
function enviarTarifarioWhatsApp() {
    const tipo = document.getElementById('tipoTarifario').value;
    const infoPeruVen = TASAS_MANUALES.find(t => t.origen === 'Perú' && t.destino === 'Venezuela');
    const tasaPeruVen = infoPeruVen ? infoPeruVen.tasa : 0;
    const tasaBCV = TASAS_BCV.USD || 0;

    if (tipo === 'ninguno' || tasaPeruVen === 0 || tasaBCV === 0) return;

    let mensaje = '';

    if (tipo === 'soles') {
        mensaje += `📋 *TARIFARIO EN SOLES A BOLÍVARES*\n`;
        mensaje += `🕐 Tasa BCV: ${tasaBCV.toFixed(2)} Bs | Perú - Ven Configurada: ${tasaPeruVen.toLocaleString('es-ES')}\n\n`;
        mensaje += `Enviado | Recibes (Bs) | Equivalente\n`;
        mensaje += `---------------------------------\n`;

        const montosSoles = [10, 20, 30, 50, 100, 150, 200, 300, 500, 1000];
        montosSoles.forEach(monto => {
            const recibesBs = monto * tasaPeruVen;
            const equivUSD = recibesBs / tasaBCV;
            mensaje += `${monto} S/ | ${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} | ${equivUSD.toFixed(2)}$\n`;
        });

    } else if (tipo === 'usd') {
        mensaje += `📋 *TARIFARIO EN USD*\n`;
        mensaje += `🕐 Tasa BCV: ${tasaBCV.toFixed(2)} Bs | Perú - Ven Configurada: ${tasaPeruVen.toLocaleString('es-ES')}\n\n`;
        mensaje += `Dólares | Recibes (Bs) | Equivalente\n`;
        mensaje += `---------------------------------\n`;

        const montosUSD = [10, 20, 30, 50, 100, 150, 200, 250, 300, 500];
        montosUSD.forEach(monto => {
            const recibesBs = monto * tasaBCV;
            const equivSoles = redondearSoles(recibesBs / tasaPeruVen);
            mensaje += `${monto}$ | ${recibesBs.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} | ${equivSoles.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} S/\n`;
        });
    }

    mensaje += `---------------------------------\n`;
    mensaje += `📱 _Enviado desde Calculadora Multidivisa_`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

function enviarWhatsApp() {
    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const monto = document.getElementById('monto').value;
    const resultadoText = document.getElementById('resultado').textContent;
    const tasaInfoText = document.getElementById('tasaInfo').innerText;
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

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

// COPIAR RECIBO DE TRANSACCIÓN EN USD / BCV (CORREGIDO)
async function copiarReciboTransaccion() {
    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const montoInput = document.getElementById('monto').value;
    const resultadoText = document.getElementById('resultado').textContent.trim(); 
    
    // Tomamos la tasa BCV directamente de la variable global numérica (sin errores de texto)
    const tasaBcvNumerica = TASAS_BCV.USD || 0;

    const bsNumerico = parseFloat(
        resultadoText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')
    ) || 0;

    let montoUSDTexto = "$0.00 USD";
    const montoBCVDeseadoVal = parseFloat(document.getElementById('montoBCVDeseado').value);
    
    if (!isNaN(montoBCVDeseadoVal) && montoBCVDeseadoVal > 0) {
        montoUSDTexto = `$${montoBCVDeseadoVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    } else if (tasaBcvNumerica > 0 && bsNumerico > 0) {
        const usdCalculado = bsNumerico / tasaBcvNumerica;
        montoUSDTexto = `$${usdCalculado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }

    const tasaTexto = tasaBcvNumerica > 0 
        ? `Bs ${tasaBcvNumerica.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (BCV $)`
        : document.getElementById('bcvUsd').textContent.trim();

    let monedaOrigenSimbolo = origen === 'Perú' ? 'S/' : (origen === 'Venezuela' ? 'Bs' : '$');

    const recibo = `━━━━━━━━━━━━━━━━━━
✅ TRANSACCIÓN REALIZADA
━━━━━━━━━━━━━━━━━━

📤 MONTO ENVIADO (${origen}):
   ${montoInput} ${monedaOrigenSimbolo}

📥 MONTO A RECIBIR (${destino}):
   ${resultadoText}

💵 EQUIVALENTE BCV:
   ${montoUSDTexto}

📊 Tasa BCV Aplicada:
   ${tasaTexto}

━━━━━━━━━━━━━━━━━━
📱 Gracias por preferirnos. 💞
━━━━━━━━━━━━━━━━━━`;

    try {
        await navigator.clipboard.writeText(recibo);
        
        const btn = document.getElementById('btnCopiarTransaccion');
        const textoOriginal = btn.textContent;
        btn.textContent = '✅ ¡Recibo Copiado!';
        btn.style.backgroundColor = '#25D366';
        btn.style.color = '#fff';

        setTimeout(() => {
            btn.textContent = textoOriginal;
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }, 2500);

    } catch (err) {
        console.error('Error al copiar recibo:', err);
        alert('No se pudo copiar automáticamente. Inténtalo nuevamente.');
    }
}

// GENERAR Y GUARDAR/COMPARTIR EL TARIFARIO COMO IMAGEN
async function guardarTarifarioImagen() {
    const contenedor = document.getElementById('contenedorTarifario');
    const btn = document.getElementById('btnImagenTarifario');
    
    if (!contenedor || contenedor.style.display === 'none') return;

    const textoOriginal = btn.textContent;
    btn.textContent = '⏳ Generando imagen...';

    try {
        const btnWa = document.getElementById('btnWhatsappTarifario');
        btnWa.style.display = 'none';
        btn.style.display = 'none';

        const canvas = await html2canvas(contenedor, {
            scale: 2,
            backgroundColor: '#1e1e1e',
            useCORS: true
        });

        btnWa.style.display = 'block';
        btn.style.display = 'block';

        canvas.toBlob(async (blob) => {
            if (!blob) {
                btn.textContent = textoOriginal;
                return;
            }

            const tipo = document.getElementById('tipoTarifario').value;
            const nombreArchivo = `Tarifario_${tipo.toUpperCase()}.png`;

            if (navigator.canShare && navigator.canShare({ files: [new File([blob], nombreArchivo, { type: 'image/png' })] })) {
                const file = new File([blob], nombreArchivo, { type: 'image/png' });
                await navigator.share({
                    title: 'Tarifario de Remesas',
                    files: [file]
                });
            } else {
                const link = document.createElement('a');
                link.download = nombreArchivo;
                link.href = URL.createObjectURL(blob);
                link.click();
            }

            btn.textContent = textoOriginal;
        }, 'image/png');

    } catch (e) {
        console.error('Error al generar la imagen:', e);
        alert('Ocurrió un error al convertir el tarifario a imagen.');
        btn.textContent = textoOriginal;
    }
}

function intercambiarPaises() {
    const origen = document.getElementById('origen');
    const destino = document.getElementById('destino');
    const temp = origen.value;
    origen.value = destino.value;
    destino.value = temp;
    calcular();
}

function toggleTabla() {
    const tabla = document.getElementById('tablaTasas');
    const btn = document.getElementById('verTasasBtn');
    if (tabla.style.display === 'none') {
        tabla.style.display = 'block';
        btn.textContent = 'Ocultar tabla de tasas';
        cargarTabla();
    } else {
        tabla.style.display = 'none';
        btn.textContent = 'Ver tabla de tasas';
    }
}

function cargarTabla() {
    const content = document.getElementById('tablaTasasContent');
    content.innerHTML = '';
    TASAS_MANUALES.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.origen}</td><td>${t.destino}</td><td>${t.tasa.toLocaleString('es-ES')}</td>`;
        content.appendChild(tr);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['origen', 'destino', 'monto', 'operacion', 'monedaBCV', 'montoBCVDeseado'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', calcular);
            el.addEventListener('input', calcular);
        }
    });

    document.getElementById('tipoTarifario').addEventListener('change', generarTarifario);
    document.getElementById('swapBtn').addEventListener('click', intercambiarPaises);
    document.getElementById('verTasasBtn').addEventListener('click', toggleTabla);
    document.getElementById('btnWhatsapp').addEventListener('click', enviarWhatsApp);
    document.getElementById('btnWhatsappTarifario').addEventListener('click', enviarTarifarioWhatsApp);
    
    document.getElementById('btnCopiarTransaccion').addEventListener('click', copiarReciboTransaccion);
    document.getElementById('btnImagenTarifario').addEventListener('click', guardarTarifarioImagen);

    obtenerTasas();
});
