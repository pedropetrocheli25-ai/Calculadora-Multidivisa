// Base de datos de tasas cruzadas y monedas resultantes
const TASAS_MANUALES = [
    { origen: 'Perú', destino: 'Venezuela', tasa: 240.10, monedaMult: 'Bs', monedaDiv: 'S/' },
    { origen: 'Perú', destino: 'Brasil', tasa: 1.20, monedaMult: 'R$', monedaDiv: 'S/' },
    { origen: 'Perú', destino: 'Colombia', tasa: 850.0, monedaMult: 'COP', monedaDiv: 'S/' },
    { origen: 'Venezuela', destino: 'Perú', tasa: 1.18, monedaMult: 'Bs', monedaDiv: 'S/' },
    { origen: 'Venezuela', destino: 'Colombia', tasa: 0.032, monedaMult: 'COP', monedaDiv: 'Bs' },
    { origen: 'Venezuela', destino: 'Brasil', tasa: 125.0, monedaMult: 'Bs', monedaDiv: 'R$' },
    { origen: 'Colombia', destino: 'Venezuela', tasa: 31.5, monedaMult: 'COP', monedaDiv: 'Bs' },
    { origen: 'Colombia', destino: 'Perú', tasa: 200.0, monedaMult: 'COP', monedaDiv: 'S/' },
    { origen: 'Colombia', destino: 'Brasil', tasa: 100.0, monedaMult: 'COP', monedaDiv: 'R$' },
    { origen: 'Brasil', destino: 'Perú', tasa: 0.83, monedaMult: 'S/', monedaDiv: 'R$' },
    { origen: 'Brasil', destino: 'Venezuela', tasa: 125.0, monedaMult: 'Bs', monedaDiv: 'R$' },
    { origen: 'Brasil', destino: 'Colombia', tasa: 3571.0, monedaMult: 'COP', monedaDiv: 'R$' }
];

function calcular() {
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

    calcular();
});
