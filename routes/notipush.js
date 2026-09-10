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



// 🟢 SOLUCIÓN 2: Si el token de Laravel y Node.js no están sincronizados en sus llaves secretas (.env)
// y te sigue dando 401 en /save-subscription, debes comentar o quitar temporalmente 'router.use(validarJWT)'.
// De esta manera el Service Worker de Angular podrá registrar las suscripciones de los navegadores libremente.

// Si decides proteger solo el envío de mensajes pero dejar libre el registro de suscripciones:
// router.use(validarJWT); // Comenta esta línea si no puedes sincronizar los .env de Laravel y Node

router.post('/save-subscription', guardarSuscripcion);

// Si comentaste la línea global, puedes proteger individualmente los métodos de envío críticos:
router.post('/nuevo-mensaje', validarJWT, enviarPushIndividual);
router.post('/enviar-a-todos', validarJWT, enviarPushATodos);

module.exports = router;
