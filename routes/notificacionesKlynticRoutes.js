const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { 
    recibirAlertaDesdeLaravel, // El webhook de recordatorios
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas,
    enviarRecordatoriosMasivos
} = require('../controllers/notificacionesKlynticController'); // Tu controlador médico

const router = Router();

// 1. Endpoint libre de token de usuario (para que Laravel le pegue directo)
router.post('/webhook-recordatorio', recibirAlertaDesdeLaravel);

// 2. Proteger las rutas de la interfaz de Angular con tu middleware existente
router.use(validarJWT);

router.get('/historial', obtenerHistorialMedico);
router.get('/unread-count', obtenerContadorMedico);
router.post('/bulk', enviarRecordatoriosMasivos);
router.put('/:id', marcarUnaLeidaMedica);

router.delete('/por_id/:id', borrarNotificacionMedicaPorId);
router.delete('/limpiar/todas', borrarTodasLasNotificacionesMedicas);

// En tu Node.js:
router.post('/paciente-sync', async (req, res) => {
    try {
        const { nombre_paciente, telefono_paciente, mongo_user_id, fecha_cita } = req.body;

        // Mandamos respuesta rápida a Laravel para liberar tu Shared Hosting
        res.status(200).json({ status: 'ok', message: 'Sincronización de paciente recibida' });

        // Guardamos en la colección klyntic_pacientes usando tu modelo de Mongoose
        // Recuerda que 'mongo_user_id' aquí actúa como el conector hacia el _id de klyntic_consultorios
        await Paciente.create({
            nombre_paciente,
            telefono_paciente,
            fecha_cita,
            mongo_user_id // Guardado como String ("45")
        });

    } catch (error) {
        console.error('Error al sincronizar paciente en Mongo:', error);
    }
});


module.exports = router;
