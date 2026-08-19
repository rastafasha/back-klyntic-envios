const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// 🔄 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Ejecutando gatillo de actualización cambiaria...');
        
        // Ejecuta la lógica asíncrona contra DolarApi con bypass de caché
        const tasa = await sincronizarTasasOficiales();

        if (tasa) {
            // 🚀 NOTIFICACIÓN SOCKET: Avisa a todas las pantallas de Angular el nuevo precio del día
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa });
                console.log(`📡 [SOCKET] Tasa emitida a Angular: ${tasa.usd} VES`);
            }

            return res.status(200).json({ ok: true, msg: 'Tasa sincronizada por cronjob con éxito', tasa });
        } else {
            return res.status(500).json({ ok: false, msg: 'La sincronización automática devolvió un valor nulo o falló.' });
        }
    } catch (error) {
        console.error('❌ Error en GET /tasks/sync-tasa-bcv:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
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
