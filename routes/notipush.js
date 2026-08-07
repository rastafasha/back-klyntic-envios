/*
 Ruta: /api/notipush
 */

const { Router } = require('express');
const router = Router();
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    guardarSuscripcion, 
    enviarPushIndividual, 
    enviarPushATodos 
} = require('../controllers/notificacionesPushController');

// Todas protegidas por el token del vecino o admin
router.use(validarJWT);

router.post('/save-subscription', guardarSuscripcion);
router.post('/nuevo-mensaje', enviarPushIndividual);
router.post('/enviar-a-todos', enviarPushATodos);

module.exports = router;
