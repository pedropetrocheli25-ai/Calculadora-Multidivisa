const PAISES = ["Perú", "Venezuela", "Colombia", "Brasil"];
const TASAS_DEFAULT = {
    "Perú-Venezuela": 271.10,
    "Venezuela-Perú": 285.50,
    "Colombia-Venezuela": 0.010,
    "Venezuela-Colombia": 100.00,
    "Brasil-Venezuela": 7.50,
    "Venezuela-Brasil": 0.133,
    "Perú-Colombia": 1050.00,
    "Colombia-Perú": 0.00095,
    "Perú-Brasil": 1.45,
    "Brasil-Perú": 0.69,
    "Colombia-Brasil": 0.0014,
    "Brasil-Colombia": 720.00
};

let tasasLocales = JSON.parse(localStorage.getItem("tasasLocales")) || {};
let tasaUsdBCV = 0;
let tasaEurBCV = 0;

Object.keys(TASAS_DEFAULT).forEach(k => {
    if (!tasasLocales[k] || isNaN(parseFloat(tasasLocales[k])) || parseFloat(tasasLocales[k]) <= 0) {
        tasasLocales[k] = TASAS_DEFAULT[k];
    }
});

function redondearAlSiguienteDiez(val) {
    if (isNaN(val) || !isFinite(val) || val <= 0) return 0;
    return Math.ceil((val + Number.EPSILON) * 10) / 10;
}

async function consultarBCV() {
    const elUsd = document.getElementById("bcvUsd");
    const elEur = document.getElementById("bcvEur");

    if (elUsd) elUsd.innerText = "Cargando...";
    if (elEur) elEur.innerText = "Cargando...";

    try {
        const res = await fetch("https://ve.dolarapi.com/v1/dolares");
        const data = await res.json();
        if (Array.isArray(data)) {
            const oficial = data.find(item => item.fuente === "oficial" || item.nombre === "Oficial");
            if (oficial && oficial.promedio) {
                tasaUsdBCV = parseFloat(oficial.promedio);
                if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
            }
        }
    } catch(e) {
        try {
            const resUsd = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
            const dataUsd = await resUsd.json();
            if (dataUsd && dataUsd.promedio) {
                tasaUsdBCV = parseFloat(dataUsd.promedio);
                if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
            }
        } catch(err) {
            if (elUsd) elUsd.innerText = "Error BCV";
        }
    }

    try {
        const resEurList = await fetch("https://ve.dolarapi.com/v1/euros");
        const dataEurList = await resEurList.json();
        if (Array.isArray(dataEurList)) {
            const oficialEur = dataEurList.find(item => item.fuente === "oficial" || item.nombre === "Oficial");
            if (oficialEur && oficialEur.promedio) {
                tasaEurBCV = parseFloat(oficialEur.promedio);
                if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
            }
        }
    } catch(e) {
        if (elEur) elEur.innerText = "Error BCV";
    }

    ejecutarCalculo();
}

function sincronizarGlobales() {
    if (typeof window.tasas !== 'object' || window.tasas === null) window.tasas = {};
    if (typeof window.TASAS !== 'object' || window.TASAS === null) window.TASAS = {};

    Object.keys(tasasLocales).forEach(key => {
        const val = parseFloat(tasasLocales[key]) || 1;
        window.tasas[key] = val;
        window.TASAS[key] = val;
    });
}

function obtenerTasaActiva(origen, destino) {
    if (origen === destino) return 1;
    const oNorm = origen ? origen.trim() : "Perú";
    const dNorm = destino ? destino.trim() : "Venezuela";
    const key = `${oNorm}-${dNorm}`;
    
    if (tasasLocales[key] && !isNaN(parseFloat(tasasLocales[key])) && parseFloat(tasasLocales[key]) > 0) {
        return parseFloat(tasasLocales[key]);
    }
    return TASAS_DEFAULT[key] || 1;
}

function formatearMoneda(monto, pais) {
    if (isNaN(monto) || !isFinite(monto)) monto = 0;
    let simbolo = "Bs";
    let decimales = 2;
    
    if (pais === "Venezuela") { simbolo = "Bs"; decimales = 2; }
    else if (pais === "Perú") { simbolo = "S/"; decimales = 2; }
    else if (pais === "Colombia") { simbolo = "COP $"; decimales = (monto % 1 === 0) ? 0 : 2; }
    else if (pais === "Brasil") { simbolo = "R$"; decimales = 2; }
    
    const partes = monto.toFixed(decimales).split(".");
    const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimal = partes[1];
    return decimales > 0 ? `${simbolo} ${entero},${decimal}` : `${simbolo} ${entero}`;
}

function ejecutarCalculo() {
    sincronizarGlobales();

    const origen = document.getElementById("origen")?.value || "Perú";
    const destino = document.getElementById("destino")?.value || "Venezuela";
    const operacion = document.getElementById("operacion")?.value || "dividir";
    const monedaBCV = document.getElementById("monedaBCV")?.value || "USD";
    const montoBCVDeseadoInput = document.getElementById("montoBCVDeseado");
    const montoInput = document.getElementById("monto");
    const tasa = obtenerTasaActiva(origen, destino);

    const tasaBCVActiva = (monedaBCV === "EUR") ? tasaEurBCV : tasaUsdBCV;
    const simBCV = (monedaBCV === "EUR") ? "€" : "$";
    const nomBCV = (monedaBCV === "EUR") ? "EUR" : "USD";

    let monto = parseFloat(montoInput?.value) || 0;
    let montoBCVDeseado = parseFloat(montoBCVDeseadoInput?.value) || 0;

    let resultadoCalculado = (operacion === "dividir") ? (tasa > 0 ? (monto / tasa) : 0) : (monto * tasa);
    let resultado = redondearAlSiguienteDiez(resultadoCalculado);

    // Identificar qué moneda se está calculando según la operación
    let monedaResultado = destino;
    let simOrigen = "S/";

    if (origen === "Venezuela" && destino === "Perú") {
        if (operacion === "multiplicar") {
            // Caso: Quieren enviar Soles a Perú. Ingestionas Soles deseados en "monto" -> resultado es en Bs a enviar
            monedaResultado = "Venezuela"; // Se muestra en Bs.
            simOrigen = "S/";
        } else {
            // Caso: Envían Bolívares directamente
            monedaResultado = "Perú"; // Se muestra en S/.
            simOrigen = "Bs";
        }
    } else {
        simOrigen = origen === "Perú" ? "S/" : (origen === "Venezuela" ? "Bs" : (origen === "Colombia" ? "COP $" : "R$"));
    }

    const lblMonto = document.getElementById("lblMonto");
    if (lblMonto) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            lblMonto.innerText = "Soles deseados a recibir en Perú (S/)";
        } else {
            lblMonto.innerText = `Monto a Enviar / Convertir (${simOrigen})`;
        }
    }

    // Muestra el resultado formateado en la pantalla verde
    const resultadoEl = document.getElementById("resultado");
    if (resultadoEl) resultadoEl.innerText = formatearMoneda(resultado, monedaResultado);

    const tasaInfoEl = document.getElementById("tasaInfo");
    if (tasaInfoEl) tasaInfoEl.innerText = `Tasa actual (${origen} ➔ ${destino}): ${tasa}`;

    // Sección BCV y Equivalencias
    const bcvSection = document.getElementById("bcvSection");
    const bcvEquivalenciaEl = document.getElementById("bcvEquivalencia");

    if (origen === "Venezuela" || destino === "Venezuela") {
        if (bcvSection) bcvSection.style.display = "block";

        if (bcvEquivalenciaEl) {
            if (tasaBCVActiva > 0) {
                bcvEquivalenciaEl.style.display = "block";
                let htmlResult = "";

                // Calcular monto total en Bolívares reales para la equivalencia BCV
                let totalBs = 0;
                if (destino === "Venezuela") {
                    totalBs = resultado;
                } else if (origen === "Venezuela") {
                    totalBs = (operacion === "multiplicar") ? resultado : monto;
                }

                if (totalBs > 0) {
                    let equivBCV = totalBs / tasaBCVActiva;
                    htmlResult += `(${simBCV} ${equivBCV.toFixed(2)} ${nomBCV} BCV)`;
                }

                if (montoBCVDeseado > 0) {
                    let bsNecesarios = montoBCVDeseado * tasaBCVActiva;
                    let origenNecesarioCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsNecesarios / tasa : 0) : (bsNecesarios * tasa);
                    let origenNecesario = redondearAlSiguienteDiez(origenNecesarioCalculado);

                    let marginTop = totalBs > 0 ? "margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);" : "";
                    htmlResult += `<div style="${marginTop} color: #b7e4c7; font-size: 1em;">🎯 Para recibir <strong>${simBCV} ${montoBCVDeseado.toFixed(2)} ${nomBCV}</strong> debe enviar:<br><span style="font-size: 1.25em; font-weight: bold; color: #ffffff;">${simOrigen} ${origenNecesario.toFixed(2)}</span> <small style="color: #94a3b8;">(Bs ${bsNecesarios.toFixed(2)})</small></div>`;
                }

                bcvEquivalenciaEl.innerHTML = htmlResult;
            } else {
                bcvEquivalenciaEl.style.display = "block";
                bcvEquivalenciaEl.innerHTML = `(Cargando equivalente BCV...)`;
            }
        }
    } else {
        if (bcvSection) bcvSection.style.display = "none";
        if (bcvEquivalenciaEl) bcvEquivalenciaEl.style.display = "none";
    }

    actualizarTablaCruzadaModal();
}

function generarTextoCotizacion() {
    const origen = document.getElementById("origen")?.value || "Perú";
    const destino = document.getElementById("destino")?.value || "Venezuela";
    const monto = parseFloat(document.getElementById("monto")?.value) || 0;
    const montoBCVDeseado = parseFloat(document.getElementById("montoBCVDeseado")?.value) || 0;
    const operacion = document.getElementById("operacion")?.value || "dividir";
    const tasa = obtenerTasaActiva(origen, destino);

    let resultadoCalculado = (operacion === "dividir") ? (tasa > 0 ? monto / tasa : 0) : (monto * tasa);
    let resultado = redondearAlSiguienteDiez(resultadoCalculado);

    let txt = `💸 *COTIZACIÓN DE REMESA* 💸\n`;
    txt += `-----------------------------------\n`;

    if (monto > 0) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            // Caso de cotización por Soles deseados
            txt += `➖ *Soles a Recibir:* S/ ${monto.toFixed(2)}\n`;
            txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
            txt += `➖ *Tasa:* ${tasa}\n`;
            txt += `➖ *Debe Enviar:* Bs ${resultado.toLocaleString('es-VE', {minimumFractionDigits: 2})}\n`;
        } else {
            const resFormateado = formatearMoneda(resultado, destino);
            const montoFormateado = formatearMoneda(monto, origen);
            txt += `➖ *Enviar:* ${montoFormateado}\n`;
            txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
            txt += `➖ *Tasa:* ${tasa}\n`;
            txt += `➖ *Recibe:* ${resFormateado}\n`;
        }
    } else {
        txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
        txt += `➖ *Tasa:* ${tasa}\n`;
    }

    if (origen === "Venezuela" || destino === "Venezuela") {
        const monedaBCV = document.getElementById("monedaBCV")?.value || "USD";
        const tasaBCVActiva = (monedaBCV === "EUR") ? tasaEurBCV : tasaUsdBCV;
        const simBCV = (monedaBCV === "EUR") ? "€" : "$";
        const nomBCV = (monedaBCV === "EUR") ? "EUR" : "USD";

        let totalBs = 0;
        if (destino === "Venezuela") {
            totalBs = resultado;
        } else if (origen === "Venezuela") {
            totalBs = (operacion === "multiplicar") ? resultado : monto;
        }

        if (tasaBCVActiva > 0 && totalBs > 0 && monto > 0) {
            let equiv = (totalBs / tasaBCVActiva).toFixed(2);
            txt += `➖ *Equivalente BCV:* ${simBCV} ${equiv} ${nomBCV} (Tasa: Bs ${tasaBCVActiva.toFixed(2)})\n`;
        }

        if (tasaBCVActiva > 0 && montoBCVDeseado > 0) {
            let bsReq = montoBCVDeseado * tasaBCVActiva;
            let origReqCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsReq / tasa : 0) : (bsReq * tasa);
            let origReq = redondearAlSiguienteDiez(origReqCalculado);
            txt += `🎯 *Para recibir ${simBCV} ${montoBCVDeseado.toFixed(2)} ${nomBCV} debe enviar:* ${origReq.toFixed(2)}\n`;
        }
    }

    if (monto > 0) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            txt += `👉 *Para recibir S/ ${monto.toFixed(2)} debes enviar Bs ${resultado.toLocaleString('es-VE', {minimumFractionDigits: 2})}*\n`;
        } else {
            const resFormateado = formatearMoneda(resultado, destino);
            const montoFormateado = formatearMoneda(monto, origen);
            txt += `👉 *Por ${montoFormateado} recibirás ${resFormateado}*\n`;
        }
    }

    txt += `-----------------------------------\n`;
    txt += `¡Gracias por tu preferencia! 🙌`;
    return txt;
}

document.addEventListener("DOMContentLoaded", () => {
    sincronizarGlobales();
    consultarBCV();

    setInterval(consultarBCV, 600000);

    const swapBtn = document.getElementById("swapBtn");
    if (swapBtn) {
        swapBtn.addEventListener("click", () => {
            const origenEl = document.getElementById("origen");
            const destinoEl = document.getElementById("destino");
            if (origenEl && destinoEl) {
                const temp = origenEl.value;
                origenEl.value = destinoEl.value;
                destinoEl.value = temp;
                ejecutarCalculo();
            }
        });
    }

    const elementosNormales = ["origen", "destino", "monto", "operacion", "monedaBCV", "montoBCVDeseado"];
    elementosNormales.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", ejecutarCalculo, true);
            el.addEventListener("change", ejecutarCalculo, true);
        }
    });

    const btnWhatsapp = document.getElementById("btnWhatsapp");
    if (btnWhatsapp) {
        btnWhatsapp.addEventListener("click", () => {
            const msg = generarTextoCotizacion();
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
        });
    }

    const btnCopiar = document.getElementById("btnCopiarTransaccion");
    if (btnCopiar) {
        btnCopiar.addEventListener("click", () => {
            const msg = generarTextoCotizacion();
            navigator.clipboard.writeText(msg).then(() => {
                alert("📋 Cotización copiada al portapapeles");
            });
        });
    }

    ejecutarCalculo();
});
