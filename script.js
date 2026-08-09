// ============================================
// CONFIGURACIÓN DE TASAS CRUZADAS MANUALES
// ============================================
const TASAS_MANUALES = [
    { origen: 'Perú', destino: 'Venezuela', tasa: 240.10, moneda: 'Bs' },
    { origen: 'Perú', destino: 'Brasil', tasa: 1.20, moneda: 'R$' },
    { origen: 'Perú', destino: 'Colombia', tasa: 0.45, moneda: 'COP' },
    { origen: 'Venezuela', destino: 'Perú', tasa: 1.18, moneda: 'S/' },
    { origen: 'Venezuela', destino: 'Colombia', tasa: 0.032, moneda: 'COP' },
    { origen: 'Venezuela', destino: 'Brasil', tasa: 0.008, moneda: 'R$' },
    { origen: 'Colombia', destino: 'Perú', tasa: 0.005, moneda: 'S/' },
    { origen: 'Colombia', destino: 'Venezuela', tasa: 31.5, moneda: 'Bs' },
    { origen: 'Colombia', destino: 'Brasil', tasa: 0.00028, moneda: 'R$' },
    { origen: 'Brasil', destino: 'Perú', tasa: 0.83, moneda: 'S/' },
    { origen: 'Brasil', destino: 'Venezuela', tasa: 125.0, moneda: 'Bs' },
    { origen: 'Brasil', destino: 'Colombia', tasa: 3571.0, moneda: 'COP' }
];

// ============================================
// OBTENER TASAS BCV (API)
// ============================================
async function obtenerTasasBCV() {
    try {
        // API para USD/VES y EUR/VES
        const responseUSD = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=VES');
        const dataUSD = await responseUSD.json();
        const tasaUSD = dataUSD.rates.VES;

        const responseEUR = await fetch('https://api.exchangerate.host/latest?base=EUR&symbols=VES');
        const dataEUR = await responseEUR.json();
        const tasaEUR = dataEUR.rates.VES;

        return { USD: tasaUSD, EUR: tasaEUR };
    } catch (error) {
        console.error('Error obteniendo tasas BCV:', error);
        // Tasas de respaldo (por si falla la API)
        return { USD: 36.0, EUR: 40.0 };
    }
}

// ============================================
// OBTENER TASA MANUAL
// ============================================
function obtenerTasaManual(origen, destino) {
    const encontrado = TASAS_MANUALES.find(
        t => t.origen === origen && t.destino === destino
    );
    return encontrado ? encontrado.tasa : null;
}

function obtenerMonedaDestino(origen, destino) {
    const encontrado = TASAS_MANUALES.find(
        t => t.origen === origen && t.destino === destino
    );
    return encontrado ? encontrado.moneda : '???';
}

// ============================================
// ACTUALIZAR TASAS BCV EN PANTALLA
// ============================================
async function actualizarBCV() {
    const tasas = await obtenerTasasBCV();
    document.getElementById('usdValue').textContent = `${tasas.USD.toFixed(2)} Bs`;
    document.getElementById('eurValue').textContent = `${tasas.EUR.toFixed(2)} Bs`;
    return tasas;
}

// ============================================
// CALCULAR
// ============================================
async function calcular() {
    // Obtener valores
    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const tipoCalculo = document.getElementById('tipoCalculo').value;
    const monto = parseFloat(document.getElementById('monto').value);
    const operacion = document.getElementById('operacion').value;
    const monedaBCV = document.getElementById('monedaBCV').value;

    // Validar
    if (!monto || monto <= 0) {
        document.getElementById('resultado').textContent = '❌ Monto inválido';
        return;
    }

    // Obtener tasas
    const tasasBCV = await obtenerTasasBCV();
    const tasaManual = obtenerTasaManual(origen, destino);
    const monedaDestino = obtenerMonedaDestino(origen, destino);

    if (!tasaManual) {
        document.getElementById('resultado').textContent = '❌ Tasa manual no encontrada';
        return;
    }

    // Aplicar operación (multiplicar o dividir sobre la tasa manual)
    let tasaManualAjustada = tasaManual;
    if (operacion === 'dividir') {
        tasaManualAjustada = 1 / tasaManual;
    }

    let resultado, detalle, monedaResultado;

    if (tipoCalculo === 'llegada') {
        // OPERACIÓN 1: Llegada en USD/EUR
        // (Monto * TasaManual) / TasaBCV
        const paso1 = monto * tasaManualAjustada;
        const tasaBCV = tasasBCV[monedaBCV];
        resultado = paso1 / tasaBCV;
        monedaResultado = monedaBCV;
        detalle = `${monto} ${monedaDestino} × ${tasaManualAjustada.toFixed(4)} = ${paso1.toFixed(2)} Bs → ${paso1.toFixed(2)} / ${tasaBCV.toFixed(2)} = ${resultado.toFixed(4)} ${monedaBCV}`;
    } else {
        // OPERACIÓN 2: Envío desde USD/EUR
        // (Monto * TasaBCV) / TasaManual
        const tasaBCV = tasasBCV[monedaBCV];
        const paso1 = monto * tasaBCV;
        resultado = paso1 / tasaManualAjustada;
        monedaResultado = monedaDestino;
        detalle = `${monto} ${monedaBCV} × ${tasaBCV.toFixed(2)} = ${paso1.toFixed(2)} Bs → ${paso1.toFixed(2)} / ${tasaManualAjustada.toFixed(4)} = ${resultado.toFixed(4)} ${monedaDestino}`;
    }

    // Mostrar resultado
    document.getElementById('resultado').textContent = resultado.toFixed(4);
    document.getElementById('monedaResultado').textContent = monedaResultado;
    document.getElementById('detalleCalculo').textContent = detalle;
}

// ============================================
// MOSTRAR TABLA DE TASAS
// ============================================
function mostrarTablaTasas() {
    const tabla = document.getElementById('tablaTasas');
    const content = document.getElementById('tablaTasasContent');
    
    if (tabla.style.display === 'none') {
        content.innerHTML = '';
        TASAS_MANUALES.forEach(t => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${t.origen}</td>
                <td>${t.destino}</td>
                <td>${t.tasa.toFixed(4)}</td>
                <td>${t.moneda}</td>
            `;
            content.appendChild(row);
        });
        tabla.style.display = 'block';
    } else {
        tabla.style.display = 'none';
    }
}

// ============================================
// EVENTOS
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await actualizarBCV();
    
    // Actualizar BCV cada 60 segundos
    setInterval(async () => {
        await actualizarBCV();
    }, 60000);
});

document.getElementById('calcularBtn').addEventListener('click', calcular);

document.getElementById('verTasasBtn').addEventListener('click', mostrarTablaTasas);

// Cálculo automático al cambiar cualquier campo
document.querySelectorAll('select, input').forEach(el => {
    el.addEventListener('change', () => {
        if (document.getElementById('monto').value) {
            calcular();
        }
    });
    el.addEventListener('input', () => {
        if (document.getElementById('monto').value) {
            calcular();
        }
    });
});