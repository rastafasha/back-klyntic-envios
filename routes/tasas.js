const { Router } = require('express');
const router = Router();

const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

router.post('/forzar-actualizacion-tasa', async (req, res) => {
    const tasa = await sincronizarTasasOficiales();
    if (tasa) {
        res.json({ ok: true, msg: 'Tasa actualizada manualmente en la mañana', tasa });
    } else {
        res.status(500).json({ ok: false, msg: 'No se pudo conectar con el BCV' });
    }
});

module.exports = router;