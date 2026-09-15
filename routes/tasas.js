const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Iniciando sincronización automática...');

        // 1. Respondemos de inmediato a cronjob.org (Evita el Timeout de 30s)
        res.status(200).json({
            ok: true,
            msg: 'Sincronización automática de USD y EUR iniciada en segundo plano.'
        });

        // 2. El servidor procesa la API y la Base de Datos en segundo plano
        sincronizarTasasOficiales()
            .then(tasas => {
                // ✅ VALIDACIÓN: Verificamos que existan ambos valores válidos
                const usdNumerico = tasas && tasas.usd ? parseFloat(tasas.usd) : NaN;
                const eurNumerico = tasas && tasas.eur ? parseFloat(tasas.eur) : NaN;

                if (!isNaN(usdNumerico) && usdNumerico > 0 && !isNaN(eurNumerico) && eurNumerico > 0) {
                    
                    // CORRECCIÓN: Notificación en tiempo real a Angular enviando AMBAS tasas
                    if (global.io) {
                        global.io.emit('tasa-bcv-actualizada', { 
                            usd: usdNumerico, 
                            eur: eurNumerico 
                        });
                    }
                    console.log(`✅ [CRON] Sockets y BD al día. Directo de API -> USD: ${usdNumerico} VES | EUR: ${eurNumerico} VES`);
                
                } else {
                    console.error('⚠️ [CRON] La API respondió pero el formato de usd o eur es inválido.', tasas);
                }
            })
            .catch(err => {
                console.error('❌ [CRON] Falló la promesa de sincronización en segundo plano:', err.message);
            });

    } catch (error) {
        console.error('❌ Error crítico estructural en la ruta del cronjob:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    }
});





// =========================================================================
// 🎛️ 2. ENDPOINT MANUAL PARA EL PANEL ADMINISTRATIVO (Método POST)
// =========================================================================
router.post('/forzar-actualizacion-tasa', async (req, res) => {
    let timeoutId = null;

    try {
        console.log('🎛️ [PANEL] Ejecutando sincronización manual de tasa solicitada por el usuario...');

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Tiempo de espera agotado al conectar con el servidor cambiario'));
            }, 25000);
        });

        // Ejecutamos la sincronización compitiendo contra el timeout
        const tasas = await Promise.race([
            sincronizarTasasOficiales(),
            timeoutPromise
        ]);

        // Si llegó aquí, limpiamos el timer inmediatamente
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        // CORRECCIÓN: Validación segura usando encadenamiento opcional (?.) para evitar caídas si tasas es null
        const usdNumerico = tasas?.usd ? parseFloat(tasas.usd) : NaN;
        const eurNumerico = tasas?.eur ? parseFloat(tasas.eur) : NaN;

        if (!isNaN(usdNumerico) && usdNumerico > 0 && !isNaN(eurNumerico) && eurNumerico > 0) {

            // Emisión unificada en tiempo real a las pantallas a través de Sockets
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { 
                    usd: usdNumerico, 
                    eur: eurNumerico 
                });
                console.log(`📡 [SOCKET] Nuevas tasas emitidas: USD ${usdNumerico} | EUR ${eurNumerico}`);
            }

            // Respuesta HTTP exitosa al Panel Administrativo
            return res.json({
                ok: true,
                msg: 'Tasas oficiales actualizadas con éxito desde el panel administrativo.',
                tasas: {
                    usd: usdNumerico,
                    eur: eurNumerico
                }
            });

        } else {
            // Esto pasará si sincronizarTasasOficiales devolvió null debido a un error interno capturado
            return res.status(400).json({
                ok: false,
                msg: 'El portal cambiario no pudo ser consultado o devolvió un formato de tasas inválido.'
            });
        }

    } catch (error) {
        // CORRECCIÓN: Limpieza segura del timer si ocurre una excepción o timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        console.error('❌ Error crítico en forzar-actualizacion-tasa:', error.message);

        if (error.message.includes('Tiempo de espera')) {
            return res.status(504).json({ 
                ok: false, 
                msg: 'El servidor externo tardó demasiado en responder. Intente de nuevo.' 
            });
        }

        return res.status(500).json({ ok: false, error: error.message });
    }
});





module.exports = router;
