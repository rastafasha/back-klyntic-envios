const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Petición externa recibida para actualizar tasa...');
        
        // Ejecuta el servicio que limpia la coma y consulta la API
        const tasa = await sincronizarTasasOficiales();

        if (tasa) {
            // Notificamos a Angular por Sockets en tiempo real si el socket está activo
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa });
            }
            return res.status(200).json({ ok: true, msg: 'Tasa sincronizada por cronjob', tasa });
        } else {
            return res.status(500).json({ ok: false, msg: 'Fallo en la sincronización automática.' });
        }
    } catch (error) {
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
