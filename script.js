// ============================================
// TASAS CRUZADAS MANUALES (TODAS LAS QUE PEDISTE)
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
// OBTENER TASAS BCV (API pública)
// ============================================
async function obtenerTasasBCV() {
    try {
        const [resUSD, resEUR] = await Promise.all([
            fetch('https://api.exchangerate.host/latest?base=USD&symbols=VES'),
            fetch('https://api.exchangerate.host/latest?base=EUR&symbols=VES')
        ]);

        const dataUSD = await resUSD.json();
        const dataEUR = await resEUR.json();

        return {
            USD: dataUSD.rates.VES || 36.0,
            EUR: dataEUR.rates.VES || 40.0
        };
    } catch (error) {
        console.error('Error BCV:', error);
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
// ACTUALIZAR BCV EN PANTALLA
// ============================================
async function actualizarBCV() {
    const tasas = await obtenerTasasBCV();
    document.getElementById('usdValue').textContent = `${tasas.USD.toFixed(2)} Bs`;
    document.getElementById('eurValue').textContent = `${tasas.EUR.toFixed(2)} Bs`;
    return tasas;
}

// ============================================
// CALCULAR AUTOMÁTICAMENTE
// ============================================
async function calcular() {
    // Obtener valores
    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const tipoCalculo = document.getElementById('tipoCalculo').value;
    const montoInput = document.getElementById('monto').value;
    const operacion = document.getElementById('operacion').value;
    const monedaBCV = document.getElementById('monedaBCV').value;

    // Validar
    const monto = parseFloat(montoInput);
    if (isNaN(monto) || monto <= 0) {
        document.getElementById('resultado').textContent = '0.00';
        document.getElementById('monedaResultado').textContent = '---';
        document.getElementById('detalleCalculo').textContent = 'Ingresa un monto válido';
        document.getElementById('tasaUsada').textContent = '';
        return;
    }

    // Obtener tasas
    const tasasBCV = await obtenerTasasBCV();
    const tasaManual = obtenerTasaManual(origen, destino);
    const monedaDestino = obtenerMonedaDestino(origen, destino);

    if (!tasaManual) {
        document.getElementById('resultado').textContent = '❌';
        document.getElementById('monedaResultado').textContent = 'Error';
        document.getElementById('detalleCalculo').textContent = `No hay tasa para ${origen} → ${destino}`;
        document.getElementById('tasaUsada').textContent = '';
        return;
    }

    // Aplicar operación sobre tasa manual
    let tasaAjustada = tasaManual;
    let operacionTexto = '';
    if (operacion === 'dividir') {
        tasaAjustada = 1 / tasaManual;
        operacionTexto = `1 / ${tasaManual.toFixed(4)} = ${tasaAjustada.toFixed(6)}`;
    } else {
        operacionTexto = `${tasaManual.toFixed(4)} (sin cambios)`;
    }

    // Variables para resultado
    let resultado, monedaResultado, detalle, tasaUsadaTexto;

    const tasaBCV = tasasBCV[monedaBCV];

    if (tipoCalculo === 'llegada') {
        // 📥 Llegada: (Monto * TasaManual) / TasaBCV
        const paso1 = monto * tasaAjustada;
        resultado = paso1 / tasaBCV;
        monedaResultado = monedaBCV;
        detalle = `${monto} ${monedaDestino} × ${tasaAjustada.toFixed(6)} = ${paso1.toFixed(2)} Bs → ${paso1.toFixed(2)} / ${tasaBCV.toFixed(2)} = ${resultado.toFixed(4)} ${monedaBCV}`;
        tasaUsadaTexto = `Tasa manual: ${tasaManual.toFixed(4)} ${monedaDestino} → Bs | BCV: ${tasaBCV.toFixed(2)} Bs/${monedaBCV}`;
    } else {
        // 📤 Envío: (Monto * TasaBCV) / TasaManual
        const paso1 = monto * tasaBCV;
        resultado = paso1 / tasaAjustada;
        monedaResultado = monedaDestino;
        detalle = `${monto} ${monedaBCV} × ${tasaBCV.toFixed(2)} = ${paso1.toFixed(2)} Bs → ${paso1.toFixed(2)} / ${tasaAjustada.toFixed(6)} = ${resultado.toFixed(4)} ${monedaDestino}`;
        tasaUsadaTexto = `Tasa manual: ${tasaManual.toFixed(4)} ${monedaDestino} | BCV: ${tasaBCV.toFixed(2)} Bs/${monedaBCV}`;
    }

    // Mostrar resultado
    document.getElementById('resultado').textContent = resultado.toFixed(4);
    document.getElementById('monedaResultado').textContent = monedaResultado;
    document.getElementById('detalleCalculo').textContent = detalle;
    document.getElementById('tasaUsada').textContent = `🔹 ${tasaUsadaTexto} | Operación: ${operacionTexto}`;

    // Aplicar color según el valor (verde si es positivo)
    const resultCard = document.getElementById('resultCard');
    if (resultado > 0) {
        document.getElementById('resultado').style.color = '#00d2d3';
    }
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
        document.getElementById('verTasasBtn').textContent = '📋 Ocultar tasas';
    } else {
        tabla.style.display = 'none';
        document.getElementById('verTasasBtn').textContent = '📋 Ver todas las tasas cruzadas';
    }
}

// ============================================
// INICIALIZAR
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Mostrar BCV
    await actualizarBCV();
    
    // Actualizar cada 30 segundos
    setInterval(async () => {
        await actualizarBCV();
    }, 30000);

    // Calcular automáticamente al cambiar cualquier campo
    const elementos = document.querySelectorAll('.form-control');
    elementos.forEach(el => {
        el.addEventListener('change', calcular);
        el.addEventListener('input', calcular);
    });

    // Botón de tabla
    document.getElementById('verTasasBtn').addEventListener('click', mostrarTablaTasas);

    // Cálculo inicial
    setTimeout(calcular, 300);
});