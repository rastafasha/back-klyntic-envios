const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Petición externa recibida. Liberando conexión inmediatamente...');
        
        // 🎯 1. RESPUESTA INMEDIATA: Evita el Timeout de 30 segundos en cron-job.org
        res.status(202).json({ 
            ok: true, 
            msg: 'Petición aceptada. Sincronizando la tasa en segundo plano...' 
        });

        // 🎯 2. PROCESAMIENTO EN SEGUNDO PLANO (Post-respuesta)
        // Ejecutamos de forma asíncrona sin bloquear la respuesta HTTP
        sincronizarTasasOficiales()
            .then((tasa) => {
                if (tasa) {
                    console.log(`✅ Tasa sincronizada con éxito en segundo plano: ${tasa}`);
                    // Notificamos a Angular por Sockets en tiempo real
                    if (global.io) {
                        global.io.emit('tasa-bcv-actualizada', { tasa });
                    }
                } else {
                    console.error('❌ Fallo en la sincronización automática: No se obtuvo tasa.');
                }
            })
            .catch(syncErr => {
                console.error('❌ Error crítico ejecutando la sincronización en segundo plano:', syncErr.message);
            });

    } catch (error) {
        console.error('❌ Error crítico en la ruta del cronjob:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    }
});


// =========================================================================
// 🎛️ 2. ENDPOINT MANUAL PARA EL PANEL ADMINISTRATIVO (Método POST)
// =========================================================================
router.post('/forzar-actualizacion-tasa', async (req, res) => {
    try {
        const tasa = await sincronizarTasasOficiales();
        
        if (tasa) {
            // También notificamos por Socket en la acción manual del médico/administrador
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa });
            }
            
            return res.json({ ok: true, msg: 'Tasa actualizada manualmente en la mañana', tasa });
        } else {
            return res.status(500).json({ ok: false, msg: 'No se pudo conectar con el BCV' });
        }
    } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
