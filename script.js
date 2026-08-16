const SHEET_ID = '1JKBGVPGPRCKIQsj1MpEvNLylxx29eCU6iFLGYAJ0qnA'; 
const API_URL = `https://opensheet.elk.sh/${SHEET_ID}/Hoja1`;

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

async function obtenerTasas() {
    const tasaInfo = document.getElementById('tasaInfo');
    tasaInfo.innerHTML = 'Obteniendo tasas...';

    try {
        const respuesta = await fetch(API_URL);
        const datos = await respuesta.json();

        TASAS_MANUALES = datos.map(item => ({
            origen: item.Origen ? item.Origen.toString().trim() : '',
            destino: item.Destino ? item.Destino.toString().trim() : '',
            tasa: item.Tasa ? parseFloat(item.Tasa.toString().replace(',', '.')) : 0,
            monedaMult: item.MonedaMult ? item.MonedaMult.toString().trim() : '',
            monedaDiv: item.MonedaDiv ? item.MonedaDiv.toString().trim() : ''
        }));

        calcular();
        generarTarifario();
    } catch (error) {
        console.error('Error al cargar las tasas:', error);
        tasaInfo.innerHTML = '⚠️ Error al cargar las tasas desde Google Sheets';
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

            // Aplicar redondeo en Soles si el origen es Perú
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

            // Aplicar redondeo en Soles si el destino es Perú
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

        // Aplicar redondeo especial si la moneda del resultado es Soles (S/ / Soles / Perú)
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
            const recibesBs = monto * tasaPeruVen; // Permanece exacto en Bs
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
            const recibesBs = monto * tasaBCV; // Permanece exacto en Bs
            // Redondeo especial en Soles aplicado aquí
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
            // Redondeo especial en Soles aplicado para el mensaje de WhatsApp
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

    obtenerTasas();
});
