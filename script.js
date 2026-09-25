const PAISES = ["Perú", "Venezuela", "Colombia", "Brasil"];

// Tasas base (se normalizan a minúsculas y sin acentos internamente para evitar errores)
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

// Inicializar tasas faltantes en el almacenamiento local
Object.keys(TASAS_DEFAULT).forEach(k => {
    if (!tasasLocales[k] || isNaN(parseFloat(tasasLocales[k])) || parseFloat(tasasLocales[k]) <= 0) {
        tasasLocales[k] = TASAS_DEFAULT[k];
    }
});

// 1. Normalización robusta: convierte "Perú" en "peru" para que nunca falle la búsqueda
const normalizar = (texto) => texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const obtenerClave = (origen, destino) => `${normalizar(origen)}-${normalizar(destino)}`;

// 2. REDONDEO INTELIGENTE: Solo aplica el redondeo al alza (.10, .20) si Perú está involucrado.
// Si es Colombia o Brasil, usa redondeo matemático normal a 2 decimales.
function redondearSegunPais(val, paisInvolucrado) {
    if (isNaN(val) || !isFinite(val) || val <= 0) return 0;
    
    if (paisInvolucrado === "Perú") {
        // Redondeo hacia arriba al siguiente décimo (ej: 30.06 -> 30.10)
        return Math.ceil(Number(val.toFixed(2)) * 10) / 10;
    }
    // Para otros países, redondeo estándar a 2 decimales
    return Math.round(val * 100) / 100;
}

// 3. Formateo de moneda profesional y automático
function formatearMoneda(monto, pais) {
    if (isNaN(monto) || !isFinite(monto)) monto = 0;
    
    const configuraciones = {
        "Venezuela": { locale: "es-VE", symbol: "Bs" },
        "Perú": { locale: "es-PE", symbol: "S/" },
        "Colombia": { locale: "es-CO", symbol: "COP $" },
        "Brasil": { locale: "pt-BR", symbol: "R$" }
    };
    
    const config = configuraciones[pais] || configuraciones["Venezuela"];
    const esColombiaEntero = pais === "Colombia" && monto % 1 === 0;
    
    const formatter = new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: esColombiaEntero ? 0 : 2,
        maximumFractionDigits: 2
    });
    
    const partes = formatter.formatToParts(monto);
    const entero = partes.find(p => p.type === "integer")?.value || "0";
    const decimal = partes.find(p => p.type === "fraction")?.value || "00";
    
    return `${config.symbol} ${entero},${decimal}`;
}

// 4. Obtención de tasa a prueba de fallos (usa la clave normalizada)
function obtenerTasaActiva(origen, destino) {
    if (normalizar(origen) === normalizar(destino)) return 1;
    const clave = obtenerClave(origen, destino);
    return parseFloat(tasasLocales[clave]) || parseFloat(TASAS_DEFAULT[clave]) || 1;
}

// 5. CÁLCULO CENTRALIZADO: Garantiza que la pantalla y el WhatsApp muestren EXACTAMENTE lo mismo
function calcularRemesa(origen, destino, montoInput, operacion) {
    const tasa = obtenerTasaActiva(origen, destino);
    let montoOrigen = 0, montoDestino = 0;

    if (operacion === "multiplicar") {
        montoOrigen = parseFloat(montoInput) || 0;
        // Aplicamos redondeo especial si Perú es el destino o el origen
        const paisParaRedondeo = (origen === "Perú" || destino === "Perú") ? "Perú" : "Otro";
        montoDestino = redondearSegunPais(montoOrigen * tasa, paisParaRedondeo);
    } else {
        montoDestino = parseFloat(montoInput) || 0;
        const paisParaRedondeo = (origen === "Perú" || destino === "Perú") ? "Perú" : "Otro";
        montoOrigen = redondearSegunPais(tasa > 0 ? montoDestino / tasa : 0, paisParaRedondeo);
    }

    return { tasa, montoOrigen, montoDestino };
}

// 6. API del BCV con Caché (ahorra datos y evita errores si se va el internet)
async function consultarBCV() {
    const elUsd = document.getElementById("bcvUsd");
    const elEur = document.getElementById("bcvEur");
    const ahora = Date.now();
    const cache = JSON.parse(localStorage.getItem("cacheBCV") || "{}");

    // Si tenemos datos de hace menos de 10 minutos, usamos el caché
    if (cache.timestamp && (ahora - cache.timestamp < 600000) && cache.usd && cache.eur) {
        tasaUsdBCV = cache.usd;
        tasaEurBCV = cache.eur;
        if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
        if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
        ejecutarCalculo();
        return;
    }

    if (elUsd) elUsd.innerText = "Cargando...";
    if (elEur) elEur.innerText = "Cargando...";

    try {
        const [resUsd, resEur] = await Promise.all([
            fetch("https://ve.dolarapi.com/v1/dolares/oficial"),
            fetch("https://ve.dolarapi.com/v1/euros/oficial")
        ]);
        
        const dataUsd = await resUsd.json();
        const dataEur = await resEur.json();

        if (dataUsd?.promedio) tasaUsdBCV = parseFloat(dataUsd.promedio);
        if (dataEur?.promedio) tasaEurBCV = parseFloat(dataEur.promedio);

        localStorage.setItem("cacheBCV", JSON.stringify({ usd: tasaUsdBCV, eur: tasaEurBCV, timestamp: ahora }));

        if (elUsd) elUsd.innerText = `Bs ${tasaUsdBCV.toFixed(2)}`;
        if (elEur) elEur.innerText = `Bs ${tasaEurBCV.toFixed(2)}`;
    } catch (err) {
        console.error("Error BCV:", err);
        if (elUsd) elUsd.innerText = "Error";
        if (elEur) elEur.innerText = "Error";
    } finally {
        ejecutarCalculo();
    }
}

// 7. Actualizar la Interfaz de Usuario
function ejecutarCalculo() {
    const origen = document.getElementById("origen")?.value || "Perú";
    const destino = document.getElementById("destino")?.value || "Venezuela";
    const operacion = document.getElementById("operacion")?.value || "dividir";
    const montoInput = parseFloat(document.getElementById("monto")?.value) || 0;
    const monedaBCV = document.getElementById("monedaBCV")?.value || "USD";
    const montoBCVDeseado = parseFloat(document.getElementById("montoBCVDeseado")?.value) || 0;

    const { tasa, montoOrigen, montoDestino } = calcularRemesa(origen, destino, montoInput, operacion);

    // Actualizar etiquetas
    const lblMonto = document.getElementById("lblMonto");
    const simOrigen = origen === "Perú" ? "S/" : (origen === "Venezuela" ? "Bs" : (origen === "Colombia" ? "COP $" : "R$"));
    
    if (lblMonto) {
        if (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar") {
            lblMonto.innerText = "Soles deseados a recibir en Perú (S/)";
        } else {
            lblMonto.innerText = `Monto a ${operacion === "multiplicar" ? "Enviar" : "Que Reciban"} (${simOrigen})`;
        }
    }

    const resultadoEl = document.getElementById("resultado");
    if (resultadoEl) resultadoEl.innerText = formatearMoneda(montoDestino, destino);

    const tasaInfoEl = document.getElementById("tasaInfo");
    if (tasaInfoEl) tasaInfoEl.innerText = `Tasa actual (${origen} ➔ ${destino}): ${tasa}`;

    // Lógica de Equivalencia BCV
    const bcvSection = document.getElementById("bcvSection");
    const bcvEquivalenciaEl = document.getElementById("bcvEquivalencia");

    if (origen === "Venezuela" || destino === "Venezuela") {
        if (bcvSection) bcvSection.style.display = "block";

        if (bcvEquivalenciaEl && tasaUsdBCV > 0 && tasaEurBCV > 0) {
            bcvEquivalenciaEl.style.display = "block";
            const tasaBCVActiva = (monedaBCV === "EUR") ? tasaEurBCV : tasaUsdBCV;
            const simBCV = (monedaBCV === "EUR") ? "€" : "$";
            const nomBCV = (monedaBCV === "EUR") ? "EUR" : "USD";

            let totalBs = (destino === "Venezuela") ? montoDestino : (operacion === "multiplicar" ? montoDestino : montoOrigen);
            let htmlResult = "";

            if (totalBs > 0 && montoOrigen > 0) {
                let equivBCV = totalBs / tasaBCVActiva;
                htmlResult += `(${simBCV} ${equivBCV.toFixed(2)} ${nomBCV} BCV)`;
            }

            if (montoBCVDeseado > 0) {
                let bsNecesarios = montoBCVDeseado * tasaBCVActiva;
                let origenNecesarioCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsNecesarios / tasa : 0) : (bsNecesarios * tasa);
                const paisParaRedondeo = (origen === "Perú" || destino === "Perú") ? "Perú" : "Otro";
                let origenNecesario = redondearSegunPais(origenNecesarioCalculado, paisParaRedondeo);

                let marginTop = totalBs > 0 ? "margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.2);" : "";
                htmlResult += `<div style="${marginTop} color: #b7e4c7; font-size: 1em;">🎯 Para recibir <strong>${simBCV} ${montoBCVDeseado.toFixed(2)} ${nomBCV}</strong> debe enviar:<br><span style="font-size: 1.25em; font-weight: bold; color: #ffffff;">${simOrigen} ${origenNecesario.toFixed(2)}</span> <small style="color: #94a3b8;">(Bs ${bsNecesarios.toFixed(2)})</small></div>`;
            }
            bcvEquivalenciaEl.innerHTML = htmlResult;
        }
    } else {
        if (bcvSection) bcvSection.style.display = "none";
        if (bcvEquivalenciaEl) bcvEquivalenciaEl.style.display = "none";
    }

    actualizarTablaCruzadaModal();
}

// 8. MENSAJE DE WHATSAPP MEJORADO Y PROFESIONAL
function generarTextoCotizacion() {
    const origen = document.getElementById("origen")?.value || "Perú";
    const destino = document.getElementById("destino")?.value || "Venezuela";
    const operacion = document.getElementById("operacion")?.value || "dividir";
    const montoInput = parseFloat(document.getElementById("monto")?.value) || 0;
    const monedaBCV = document.getElementById("monedaBCV")?.value || "USD";
    const montoBCVDeseado = parseFloat(document.getElementById("montoBCVDeseado")?.value) || 0;

    const { tasa, montoOrigen, montoDestino } = calcularRemesa(origen, destino, montoInput, operacion);
    const esCasoEspecial = (origen === "Venezuela" && destino === "Perú" && operacion === "multiplicar");
    const simOrigen = origen === "Perú" ? "S/" : (origen === "Venezuela" ? "Bs" : (origen === "Colombia" ? "COP $" : "R$"));

    // Fecha actual formateada
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });

    let txt = `💸 *COTIZACIÓN DE REMESA* 💸\n`;
    txt += `📅 *Fecha:* ${fecha}\n`;
    txt += `-----------------------------------\n`;
    
    if (montoOrigen > 0) {
        if (esCasoEspecial) {
            txt += `➖ *Soles a Recibir:* S/ ${montoOrigen.toFixed(2)}\n`;
            txt += `➖ *Debes Enviar:* ${formatearMoneda(montoDestino, "Venezuela")}\n`;
        } else {
            txt += `➖ *Envías:* ${formatearMoneda(montoOrigen, origen)}\n`;
            txt += `➖ *Recibes:* ${formatearMoneda(montoDestino, destino)}\n`;
        }
        txt += `➖ *Ruta:* ${origen} ➔ ${destino}\n`;
        txt += `➖ *Tasa aplicada:* ${tasa}\n`;
    } else {
        txt += `➖ *Ruta:* ${origen} ➔ ${destino}\n`;
        txt += `➖ *Tasa actual:* ${tasa}\n`;
    }

    // Agregar info BCV si aplica
    if ((origen === "Venezuela" || destino === "Venezuela") && tasaUsdBCV > 0) {
        const tasaBCVActiva = (monedaBCV === "EUR") ? tasaEurBCV : tasaUsdBCV;
        const simBCV = (monedaBCV === "EUR") ? "€" : "$";
        const nomBCV = (monedaBCV === "EUR") ? "EUR" : "USD";
        
        let totalBs = (destino === "Venezuela") ? montoDestino : (operacion === "multiplicar" ? montoDestino : montoOrigen);
        
        if (totalBs > 0 && montoOrigen > 0) {
            let equiv = (totalBs / tasaBCVActiva).toFixed(2);
            txt += `➖ *Equivalente BCV:* ${simBCV} ${equiv} ${nomBCV} (Tasa: Bs ${tasaBCVActiva.toFixed(2)})\n`;
        }

        if (montoBCVDeseado > 0) {
            let bsNecesarios = montoBCVDeseado * tasaBCVActiva;
            let origenNecesarioCalculado = (operacion === "multiplicar") ? (tasa > 0 ? bsNecesarios / tasa : 0) : (bsNecesarios * tasa);
            const paisParaRedondeo = (origen === "Perú" || destino === "Perú") ? "Perú" : "Otro";
            let origenNecesario = redondearSegunPais(origenNecesarioCalculado, paisParaRedondeo);
            txt += `🎯 *Para recibir ${simBCV}${montoBCVDeseado.toFixed(2)} ${nomBCV}, debes enviar:* ${simOrigen} ${origenNecesario.toFixed(2)}\n`;
        }
    }

    txt += `-----------------------------------\n`;
    txt += `✅ *¡Listo para procesar!* Escríbeme para confirmar tu envío. 🙌`;
    return txt;
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

// 9. INICIALIZACIÓN Y EVENTOS
document.addEventListener("DOMContentLoaded", () => {
    consultarBCV();
    setInterval(consultarBCV, 600000); // Actualizar cada 10 minutos

    // Botón de intercambio
    document.getElementById("swapBtn")?.addEventListener("click", () => {
        const origenEl = document.getElementById("origen");
        const destinoEl = document.getElementById("destino");
        if (origenEl && destinoEl) {
            [origenEl.value, destinoEl.value] = [destinoEl.value, origenEl.value];
            ejecutarCalculo();
        }
    });

    // Escuchar cambios en los inputs
    ["origen", "destino", "monto", "operacion", "monedaBCV", "montoBCVDeseado"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", ejecutarCalculo);
    });

    // WhatsApp
    document.getElementById("btnWhatsapp")?.addEventListener("click", () => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(generarTextoCotizacion())}`, '_blank');
    });

    // Copiar al portapapeles
    document.getElementById("btnCopiarTransaccion")?.addEventListener("click", () => {
        navigator.clipboard.writeText(generarTextoCotizacion()).then(() => {
            alert("📋 Cotización copiada al portapapeles exitosamente.");
        }).catch(() => {
            alert("❌ Error al copiar. Intenta manualmente.");
        });
    });

    // --- LÓGICA DEL EDITOR DE TASAS (Ahora sí funciona) ---
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

    btnAbrir?.addEventListener("click", () => {
        renderTablaEditor();
        seccionEditor.style.display = seccionEditor.style.display === "none" ? "block" : "none";
    });

    btnCerrar?.addEventListener("click", () => {
        seccionEditor.style.display = "none";
    });

    btnGuardar?.addEventListener("click", () => {
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
        alert("✅ Tasas guardadas correctamente en este dispositivo.");
        seccionEditor.style.display = "none";
    });

    // Modal de tabla de tasas
    const verTasasBtn = document.getElementById("verTasasBtn");
    const tablaTasasModal = document.getElementById("tablaTasas");
    verTasasBtn?.addEventListener("click", () => {
        if (tablaTasasModal.style.display === "none" || !tablaTasasModal.style.display) {
            actualizarTablaCruzadaModal();
            tablaTasasModal.style.display = "block";
            verTasasBtn.innerText = "Ocultar tabla de tasas";
        } else {
            tablaTasasModal.style.display = "none";
            verTasasBtn.innerText = "Ver tabla de tasas";
        }
    });

    // Cálculo inicial
    ejecutarCalculo();
});