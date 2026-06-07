const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    recibirAlertaDesdeLaravel, // El webhook de recordatorios
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas
} = require('../controllers/notificacionesKlynticController'); // Tu controlador médico

const router = Router();

// 1. Endpoint libre de token de usuario (para que Laravel le pegue directo)
router.post('/webhook-recordatorio', recibirAlertaDesdeLaravel);

// 2. Proteger las rutas de la interfaz de Angular con tu middleware existente
router.use(validarJWT);

router.get('/historial', obtenerHistorialMedico);
router.get('/unread-count', obtenerContadorMedico);
router.put('/:id', marcarUnaLeidaMedica);
router.delete('/por_id/:id', borrarNotificacionMedicaPorId);
router.delete('/limpiar/todas', borrarTodasLasNotificacionesMedicas);

module.exports = router;
