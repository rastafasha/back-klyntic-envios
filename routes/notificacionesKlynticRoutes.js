const { Router } = require('express');
const { 
    recibirAlertaDesdeLaravel, 
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas,
    enviarRecordatoriosMasivos,
    enviarNotificacionPaciente
} = require('../controllers/notificacionesKlynticController'); 
const { validarJWT } = require('../middlewares/validar-jwt');

const router = Router();

// 1. Endpoints LIBRES de token de usuario (Acceso directo para Laravel y consultas rápidas de Angular)
router.post('/webhook-recordatorio', recibirAlertaDesdeLaravel);

// 🟢 SOLUCIÓN AL 401: Colocamos la consulta del usuario AQUÍ arriba, antes de proteger el archivo con validarJWT.
// Esto permite que el 'cargarContadorInicial' de tu Angular lea el historial de MongoDB sin ser rebotado.
router.get('/usuario/:id', obtenerHistorialMedico);


// 2. Endpoints protegidos o de uso exclusivo del sistema
router.post('/bulk', enviarRecordatoriosMasivos);

// Sincronización libre para el Shared Hosting de Laravel
router.post('/paciente-sync', async (req, res) => {
    try {
        const { nombre_paciente, telefono_paciente, mongo_user_id, fecha_cita } = req.body;
        res.status(200).json({ status: 'ok', message: 'Sincronización de paciente recibida' });
        await Paciente.create({
            nombre_paciente,
            telefono_paciente,
            fecha_cita,
            mongo_user_id 
        });
    } catch (error) {
        console.error('Error al sincronizar paciente en Mongo:', error);
    }
});


// 🔒 A PARTIR DE AQUÍ TODO REQUIERE VALIDACIÓN JWT
router.use(validarJWT);

router.get('/unread-count', obtenerContadorMedico);
router.put('/:id', marcarUnaLeidaMedica);
router.post('/enviar-notificacion', enviarNotificacionPaciente);
router.get('/historial', obtenerHistorialMedico);
router.delete('/por_id/:id', borrarNotificacionMedicaPorId);
router.delete('/limpiar/todas', borrarTodasLasNotificacionesMedicas);

module.exports = router;
