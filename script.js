// Tu ID de Google Sheets integrado
const SHEET_ID = '1JKBGVPGPRCKIQsj1MpEvNLylxx29eCU6iFLGYAJ0qnA'; 
// Si la pestaña de tu hoja se llama distinto a "Hoja1" (por ejemplo, "Sheet1"), cámbialo aquí al final:
const API_URL = `https://opensheet.elk.sh/${SHEET_ID}/Hoja1`;

let TASAS_MANUALES = [];

async function obtenerTasas() {
    const tasaInfo = document.getElementById('tasaInfo');
    tasaInfo.innerHTML = 'Obteniendo tasas actualizadas...';

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
    } catch (error) {
        console.error('Error al cargar las tasas:', error);
        tasaInfo.innerHTML = '⚠️ Error al cargar las tasas desde Google Sheets';
    }
}

function calcular() {
    if (TASAS_MANUALES.length === 0) return;

    const origen = document.getElementById('origen').value;
    const destino = document.getElementById('destino').value;
    const monto = parseFloat(document.getElementById('monto').value) || 0;
    const operacion = document.getElementById('operacion').value;

    const infoTasa = TASAS_MANUALES.find(t => t.origen === origen && t.destino === destino);

    if (!infoTasa) {
        document.getElementById('tasaInfo').innerHTML = `Sin tasa configurada para <strong>${origen} → ${destino}</strong>`;
        document.getElementById('resultado').textContent = '---';
        return;
    }

    const tasa = infoTasa.tasa;
    document.getElementById('tasaInfo').innerHTML = `Tasa ${origen} → ${destino}: <strong>${tasa.toLocaleString('es-ES')}</strong>`;

    let resultado = 0;
    let moneda = '';

    if (operacion === 'multiplicar') {
        resultado = monto * tasa;
        moneda = infoTasa.monedaMult;
        document.getElementById('lblResultadoTitle').textContent = 'Resultado (Monto × Tasa)';
    } else {
        resultado = tasa !== 0 ? monto / tasa : 0;
        moneda = infoTasa.monedaDiv;
        document.getElementById('lblResultadoTitle').textContent = 'Resultado (Monto ÷ Tasa)';
    }

    const resFormateado = resultado.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    document.getElementById('resultado').textContent = `${moneda} ${resFormateado}`;
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
    const inputs = ['origen', 'destino', 'monto', 'operacion'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('change', calcular);
        document.getElementById(id).addEventListener('input', calcular);
    });

    document.getElementById('swapBtn').addEventListener('click', intercambiarPaises);
    document.getElementById('verTasasBtn').addEventListener('click', toggleTabla);

    // Cargar tasas al iniciar
    obtenerTasas();
});
