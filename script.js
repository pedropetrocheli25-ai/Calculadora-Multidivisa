const PAISES = ["Perú", "Venezuela", "Colombia", "Brasil"];

const TASAS_DEFAULT = {
    "peru-venezuela": 271.10, "venezuela-peru": 285.50,
    "colombia-venezuela": 0.010, "venezuela-colombia": 100.00,
    "brasil-venezuela": 7.50, "venezuela-brasil": 0.133,
    "peru-colombia": 1050.00, "colombia-peru": 0.00095,
    "peru-brasil": 1.45, "brasil-peru": 0.69,
    "colombia-brasil": 0.0014, "brasil-colombia": 720.00
};

let tasasLocales = JSON.parse(localStorage.getItem("tasasLocales")) || {};
let tasaUsdBCV = 0;
let tasaEurBCV = 0;
let ultimaActualizacionBCV = null;

Object.keys(TASAS_DEFAULT).forEach(k => {
    if (!tasasLocales[k] || isNaN(parseFloat(tasasLocales[k])) || parseFloat(tasasLocales[k]) <= 0) {
        tasasLocales[k] = TASAS_DEFAULT[k];
    }
});

const normalizar = (texto) => texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const obtenerClave = (origen, destino) => `${normalizar(origen)}-${normalizar(destino)}`;

function redondearAlSiguienteDiez(val) {
    if (isNaN(val) || !isFinite(val) || val <= 0) return 0;
    return Math.ceil(Number(val.toFixed(2)) * 10) / 10;
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

function obtenerTasaActiva(origen, destino) {
    if (normalizar(origen) === normalizar(destino)) return 1;
    const clave = obtenerClave(origen, destino);
    return parseFloat(tasasLocales[clave]) || parseFloat(TASAS_DEFAULT[clave]) || 1;
}

function ejecutarCalculo() {
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
    const simOrigen = origen === "Perú" ? "S/" : (origen === "Venezuela" ? "Bs" : (origen === "Colombia" ? "COP $" : "R$"));

    let monto = parseFloat(montoInput?.value) || 0;
    let montoBCVDeseado = parseFloat(montoBCVDeseadoInput?.value) || 0;

    let resultadoCalculado = (operacion === "dividir") ? (tasa > 0 ? (monto / tasa) : 0) : (monto * tasa);

    let resultado = resultadoCalculado;
    if (origen === "Perú" || destino === "Perú") {
        resultado = redondearAlSiguienteDiez(resultadoCalculado);
    } else {
        resultado = Math.round(resultadoCalculado * 100) / 100;
    }

    let monedaResultado = destino;
    if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
        monedaResultado = "Venezuela";
    }

    // ✅ MODIFICACIÓN: Pantalla verde sin duplicidad
    const resultadoEl = document.getElementById("resultado");
    const bcvEquivalenciaEl = document.getElementById("bcvEquivalencia");

    if (resultadoEl) {
        if (monto === 0 && montoBCVDeseado > 0 && tasaBCVActiva > 0) {
            // Modo "recibir USD/EUR": Ocultar resultado grande (se muestra abajo en el mensaje BCV)
            resultadoEl.style.display = "none";
        } else {
            resultadoEl.style.display = "block";
            resultadoEl.innerText = formatearMoneda(resultado, monedaResultado);
        }
    }

    const tasaInfoEl = document.getElementById("tasaInfo");
    if (tasaInfoEl) tasaInfoEl.innerText = `Tasa actual (${origen} ➔ ${destino}): ${tasa}`;

    const lblMonto = document.getElementById("lblMonto");
    if (lblMonto) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            lblMonto.innerText = "Soles deseados a recibir en Perú (S/)";
        } else {
            lblMonto.innerText = `Monto a Enviar / Convertir (${simOrigen})`;
        }
    }

    const bcvSection = document.getElementById("bcvSection");

    if (origen === "Venezuela" || destino === "Venezuela") {
        if (bcvSection) bcvSection.style.display = "block";

        if (bcvEquivalenciaEl) {
            if (tasaBCVActiva > 0) {
                bcvEquivalenciaEl.style.display = "block";
                let htmlResult = "";

                let totalBs = 0;
                if (destino === "Venezuela") {
                    totalBs = resultado;
                } else if (origen === "Venezuela") {
                    totalBs = (operacion === "multiplicar") ? resultado : monto;
                }

                if (monto === 0 && montoBCVDeseado > 0) {
                    totalBs = montoBCVDeseado * tasaBCVActiva;
                }

                // Mostrar equivalencia BCV solo si hay monto principal
                if (totalBs > 0 && monto > 0) {
                    let equivBCV = totalBs / tasaBCVActiva;
                    let horaActual = ultimaActualizacionBCV ? ` · Actualizado: ${ultimaActualizacionBCV}` : "";
                    htmlResult += `(${simBCV} ${equivBCV.toFixed(2)} ${nomBCV} BCV${horaActual})`;
                }

                // Mensaje principal de "Para recibir X debe enviar Y"
                if (montoBCVDeseado > 0) {
                    let bsNecesarios = montoBCVDeseado * tasaBCVActiva;
                    let origenNecesarioCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsNecesarios / tasa : 0) : (bsNecesarios * tasa);
                    let origenNecesario = origenNecesarioCalculado;
                    if (origen === "Perú" || destino === "Perú") {
                        origenNecesario = redondearAlSiguienteDiez(origenNecesarioCalculado);
                    } else {
                        origenNecesario = Math.round(origenNecesarioCalculado * 100) / 100;
                    }

                    let marginTop = (totalBs > 0 && monto > 0) ? "margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);" : "";
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
    const monedaBCV = document.getElementById("monedaBCV")?.value || "USD";
    const tasaBCVActiva = (monedaBCV === "EUR") ? tasaEurBCV : tasaUsdBCV;
    const simBCV = (monedaBCV === "EUR") ? "€" : "$";
    const nomBCV = (monedaBCV === "EUR") ? "EUR" : "USD";

    let resultadoCalculado = (operacion === "dividir") ? (tasa > 0 ? monto / tasa : 0) : (monto * tasa);
    let resultado = resultadoCalculado;
    if (origen === "Perú" || destino === "Perú") {
        resultado = redondearAlSiguienteDiez(resultadoCalculado);
    } else {
        resultado = Math.round(resultadoCalculado * 100) / 100;
    }

    const simOrigen = origen === "Perú" ? "S/" : (origen === "Venezuela" ? "Bs" : (origen === "Colombia" ? "COP $" : "R$"));
    const resFormateado = formatearMoneda(resultado, destino);
    const montoFormateado = formatearMoneda(monto, origen);

    let txt = `💸 *COTIZACIÓN DE REMESA* 💸\n`;
    txt += `-----------------------------------\n`;

    if (monto > 0) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            txt += `➖ *Soles a Recibir:* S/ ${monto.toFixed(2)}\n`;
            txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
            txt += `➖ *Tasa:* ${tasa}\n`;
            txt += `➖ *Debe Enviar:* Bs ${resultado.toLocaleString('es-VE', {minimumFractionDigits: 2})}\n`;
        } else {
            txt += ` *Enviar:* ${montoFormateado}\n`;
            txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
            txt += `➖ *Tasa:* ${tasa}\n`;
            txt += ` *Recibe:* ${resFormateado}\n`;
        }
    } else if (montoBCVDeseado > 0) {
        const bsReq = montoBCVDeseado * tasaBCVActiva;
        let origReqCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsReq / tasa : 0) : (bsReq * tasa);
        let origReq = origReqCalculado;
        if (origen === "Perú" || destino === "Perú") {
            origReq = redondearAlSiguienteDiez(origReqCalculado);
        } else {
            origReq = Math.round(origReqCalculado * 100) / 100;
        }
        
        txt += `➖ *Para recibir:* ${simBCV} ${montoBCVDeseado.toFixed(2)} ${nomBCV}\n`;
        txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
        txt += `➖ *Tasa de cambio:* ${tasa}\n`;
        txt += `➖ *Tasa BCV:* Bs ${tasaBCVActiva.toFixed(2)}\n`;
        txt += `➖ *Debe Enviar:* ${simOrigen} ${origReq.toFixed(2)}\n`;
        txt += `➖ *Recibe en Bs:* ${formatearMoneda(bsReq, "Venezuela")}\n`;
    } else {
        txt += `➖ *De:* ${origen} ➔ *A:* ${destino}\n`;
        txt += `➖ *Tasa:* ${tasa}\n`;
    }

    if (origen === "Venezuela" || destino === "Venezuela") {
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
    }

    txt += `-----------------------------------\n`;
    txt += `¡Gracias por tu preferencia! 🙌`;
    return txt;
}

async function consultarBCV() {
    const elUsd = document.getElementById("bcvUsd");
    const elEur = document.getElementById("bcvEur");

    if (elUsd) elUsd.innerText = "Cargando...";
    if (elEur) elEur.innerText = "Cargando...";

    let usdObtenido = false;
    let eurObtenido = false;

    try {
        const [resUsd, resEur] = await Promise.all([
            fetch("https://pydolarve.org/api/v1/dollar?page=bcv"),
            fetch("https://pydolarve.org/api/v1/euro?page=bcv")
        ]);

        if (resUsd.ok) {
            const dataUsd = await resUsd.json();
            if (dataUsd?.monitors?.bcv?.price) {
                tasaUsdBCV = parseFloat(dataUsd.monitors.bcv.price);
                if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
                usdObtenido = true;
            }
        }

        if (resEur.ok) {
            const dataEur = await resEur.json();
            if (dataEur?.monitors?.bcv?.price) {
                tasaEurBCV = parseFloat(dataEur.monitors.bcv.price);
                if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
                eurObtenido = true;
            }
        }
    } catch(e) {
        console.log("API 1 falló, intentando API 2...");
    }

    if (!usdObtenido || !eurObtenido) {
        try {
            if (!usdObtenido) {
                const resUsd = await fetch("https://pydolarve.org/api/v1/dollar/bcv");
                if (resUsd.ok) {
                    const dataUsd = await resUsd.json();
                    if (dataUsd?.monitors?.bcv?.price) {
                        tasaUsdBCV = parseFloat(dataUsd.monitors.bcv.price);
                        if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
                        usdObtenido = true;
                    }
                }
            }

            if (!eurObtenido) {
                const resEur = await fetch("https://pydolarve.org/api/v1/euro/bcv");
                if (resEur.ok) {
                    const dataEur = await resEur.json();
                    if (dataEur?.monitors?.bcv?.price) {
                        tasaEurBCV = parseFloat(dataEur.monitors.bcv.price);
                        if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
                        eurObtenido = true;
                    }
                }
            }
        } catch(e) {
            console.log("API 2 falló, intentando API 3...");
        }
    }

    if (!usdObtenido || !eurObtenido) {
        try {
            if (!usdObtenido) {
                const resUsd = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
                if (resUsd.ok) {
                    const dataUsd = await resUsd.json();
                    if (dataUsd?.promedio) {
                        tasaUsdBCV = parseFloat(dataUsd.promedio);
                        if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
                        usdObtenido = true;
                    }
                }
            }

            if (!eurObtenido) {
                const resEur = await fetch("https://ve.dolarapi.com/v1/euros/oficial");
                if (resEur.ok) {
                    const dataEur = await resEur.json();
                    if (dataEur?.promedio) {
                        tasaEurBCV = parseFloat(dataEur.promedio);
                        if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
                        eurObtenido = true;
                    }
                }
            }
        } catch(e) {
            console.error("Todas las APIs fallaron:", e);
            if (!usdObtenido && elUsd) elUsd.innerText = "Error";
            if (!eurObtenido && elEur) elEur.innerText = "Error";
        }
    }

    if (usdObtenido || eurObtenido) {
        const ahora = new Date();
        ultimaActualizacionBCV = ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem("cacheBCV", JSON.stringify({
            usd: tasaUsdBCV,
            eur: tasaEurBCV,
            timestamp: ahora.toISOString()
        }));
    } else {
        const cache = JSON.parse(localStorage.getItem("cacheBCV") || "{}");
        if (cache.usd && cache.eur) {
            tasaUsdBCV = cache.usd;
            tasaEurBCV = cache.eur;
            if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
            if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
            const cacheDate = new Date(cache.timestamp);
            ultimaActualizacionBCV = `Caché ${cacheDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
        }
    }

    ejecutarCalculo();
}

function actualizarTablaCruzadaModal() {
    const tbody = document.getElementById("tablaTasasContent");
    if (!tbody) return;
    tbody.innerHTML = "";
    PAISES.forEach(o => {
        PAISES.forEach(d => {
            if (normalizar(o) !== normalizar(d)) {
                const t = obtenerTasaActiva(o, d);
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid #334155";
                tr.innerHTML = `
                    <td style="padding: 8px; color: #ffffff;">${o}</td>
                    <td style="padding: 8px; color: #ffffff;">${d}</td>
                    <td style="padding: 8px; font-weight: bold; color: #74c69d; text-align: right;">${t}</td>
                `;
                tbody.appendChild(tr);
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const cache = JSON.parse(localStorage.getItem("cacheBCV") || "{}");
    if (cache.usd && cache.eur && cache.timestamp) {
        const cacheAge = Date.now() - new Date(cache.timestamp).getTime();
        if (cacheAge < 3600000) {
            tasaUsdBCV = cache.usd;
            tasaEurBCV = cache.eur;
            const cacheDate = new Date(cache.timestamp);
            ultimaActualizacionBCV = cacheDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        }
    }

    consultarBCV();
    setInterval(consultarBCV, 180000);

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

    const verTasasBtn = document.getElementById("verTasasBtn");
    const tablaTasasModal = document.getElementById("tablaTasas");
    if (verTasasBtn && tablaTasasModal) {
        verTasasBtn.addEventListener("click", (e) => {
            e.stopImmediatePropagation();
            if (tablaTasasModal.style.display === "none" || !tablaTasasModal.style.display) {
                actualizarTablaCruzadaModal();
                tablaTasasModal.style.display = "block";
                verTasasBtn.innerText = "Ocultar tabla de tasas";
            } else {
                tablaTasasModal.style.display = "none";
                verTasasBtn.innerText = "Ver tabla de tasas";
            }
        }, true);
    }

    const btnAbrir = document.getElementById("btnAbrirEditor");
    const btnCerrar = document.getElementById("btnCerrarEditor");
    const seccionEditor = document.getElementById("seccionEditorTasas");
    const btnGuardar = document.getElementById("btnGuardarTodasLasTasas");
    const listaTabla = document.getElementById("listaTasasEditables");

    function renderTablaEditor() {
        if (!listaTabla) return;
        listaTabla.innerHTML = "";
        PAISES.forEach(o => {
            PAISES.forEach(d => {
                if (normalizar(o) !== normalizar(d)) {
                    const par = obtenerClave(o, d);
                    const val = obtenerTasaActiva(o, d);
                    const tr = document.createElement("tr");
                    tr.style.borderBottom = "1px solid #334155";
                    tr.innerHTML = `
                        <td style="padding: 8px; color: #f8fafc; font-size: 0.85em; font-weight: 600;">${o} ➔ ${d}</td>
                        <td style="padding: 8px; text-align: right;">
                            <input type="number" step="any" value="${val}" data-par="${par}" class="input-tasa-editor" style="padding: 6px 8px; font-size: 0.9em; width: 100px; text-align: right; background: #0f172a; color: #74c69d; border: 1px solid #334155; border-radius: 6px; font-weight: bold;">
                        </td>
                    `;
                    listaTabla.appendChild(tr);
                }
            });
        });
    }

    if (btnAbrir && seccionEditor) {
        btnAbrir.addEventListener("click", () => {
            renderTablaEditor();
            seccionEditor.style.display = seccionEditor.style.display === "none" ? "block" : "none";
        });
    }

    if (btnCerrar && seccionEditor) {
        btnCerrar.addEventListener("click", () => seccionEditor.style.display = "none");
    }

    if (btnGuardar) {
        btnGuardar.addEventListener("click", () => {
            const inputs = document.querySelectorAll(".input-tasa-editor");
            inputs.forEach(inp => {
                const par = inp.getAttribute("data-par");
                const v = parseFloat(inp.value);
                if (par && !isNaN(v) && v > 0) {
                    tasasLocales[par] = v;
                }
            });
            localStorage.setItem("tasasLocales", JSON.stringify(tasasLocales));
            ejecutarCalculo();
            actualizarTablaCruzadaModal();
            alert("✅ Todas las tasas se guardaron correctamente en tu dispositivo.");
            if (seccionEditor) seccionEditor.style.display = "none";
        });
    }

    ejecutarCalculo();
});