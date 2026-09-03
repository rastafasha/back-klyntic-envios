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
            msg: 'Sincronización automática iniciada en segundo plano.'
        });

        // 2. El servidor Starter procesa la API y la Base de Datos en segundo plano
        sincronizarTasasOficiales()
            .then(tasa => {
                // ✅ VALIDACIÓN CORRECTA: Leemos .usd del objeto retornado por la v6
                const tasaNumerica = tasa && tasa.usd ? parseFloat(tasa.usd) : NaN;

                if (!isNaN(tasaNumerica) && tasaNumerica > 0) {
                    // Notificación en tiempo real a las pantallas de Angular
                    if (global.io) {
                        global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
                    }
                    console.log(`✅ [CRON] Base de datos y Sockets actualizados con éxito: ${tasaNumerica} VES`);
                } else {
                    console.error('⚠️ [CRON] La API respondió pero el formato de tasa.usd es inválido.');
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

        // Guardamos la respuesta en la variable "tasa"
        const tasa = await Promise.race([
            sincronizarTasasOficiales(),
            timeoutPromise
        ]);

        if (timeoutId) clearTimeout(timeoutId);

        // ✅ CORREGIDO: Usamos "tasa" en lugar de "resultado" que no existía
        const tasaNumerica = tasa && tasa.usd ? parseFloat(tasa.usd) : NaN;

        if (!isNaN(tasaNumerica) && tasaNumerica > 0) {

            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
                // Opcional por si quieres emitir el euro también:
                if (tasa.eur) global.io.emit('tasa-euro-actualizada', { tasa: parseFloat(tasa.eur) });
                console.log(`📡 [SOCKET] Nueva tasa emitida globalmente: ${tasaNumerica}`);
            }

            return res.json({
                ok: true,
                msg: 'Tasa oficial actualizada con éxito desde el panel administrativo.',
                tasa: tasaNumerica
            });

        } else {
            return res.status(400).json({
                ok: false,
                msg: 'El portal cambiario respondió correctamente pero devolvió un formato de tasa inválido o vacío.'
            });
        }

    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);

        console.error('❌ Error crítico en forzar-actualizacion-tasa:', error.message);

        if (error.message.includes('Tiempo de espera')) {
            return res.status(504).json({ ok: false, msg: error.message });
        }

        return res.status(500).json({ ok: false, error: error.message });
    }
});




module.exports = router;
