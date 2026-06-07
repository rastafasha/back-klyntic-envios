const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu esquema médico en Mongo

// =========================================================================
// 🌐 EL WEBHOOK: Receptor de órdenes de Laravel (MySQL)
// =========================================================================
const recibirAlertaDesdeLaravel = async (req, res) => {
    try {
        const { consultorio_id, telefono, mensaje } = req.body;

        // Limpiamos el teléfono con tu lógica del '58' de Venezuela
        let telefonoLimpio = telefono.replace(/\D/g, ''); 
        if (telefonoLimpio.startsWith('0')) {
            telefonoLimpio = '58' + telefonoLimpio.substring(1); 
        }

        // Ejecutamos la función asíncrona multitenant
        // Node busca el Chrome invisible de ese consultorio_id y dispara el WhatsApp
        enviarMensajeWhatsApp(consultorio_id, telefonoLimpio, mensaje)
            .then(enviado => {
                if (enviado) console.log(`💬 WhatsApp médico enviado para el consultorio: ${consultorio_id}`);
            })
            .catch(err => console.error('Error enviando WhatsApp médico:', err.message));

        // Respondemos 200 de inmediato a Laravel para que no se quede colgado
        return res.status(200).json({ ok: true, msg: 'Orden de recordatorio procesada por Node.' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// =========================================================================
// 🔔 HISTORIAL Y INTERFAZ DE ANGULAR (MÉDICOS / PACIENTES)
// =========================================================================
const obtenerHistorialMedico = async (req, res) => {
    try {
        const uid = req.uid; // Extraído de validarJWT
        const notificaciones = await NotificacionMedica.find({ usuario: uid }).sort({ fecha: -1 });
        return res.json({ ok: true, notificaciones });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const obtenerContadorMedico = async (req, res) => {
    try {
        const uid = req.uid;
        const contador = await NotificacionMedica.countDocuments({ usuario: uid, leido: false });
        return res.json({ ok: true, unreadCount: contador });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const marcarUnaLeidaMedica = async (req, res) => {
    try {
        const notiId = req.params.id;
        const notificacion = await NotificacionMedica.findByIdAndUpdate(notiId, { leido: true }, { new: true });
        return res.json({ ok: true, notificacion });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const borrarNotificacionMedicaPorId = async (req, res) => {
    try {
        await NotificacionMedica.findByIdAndDelete(req.params.id);
        return res.json({ ok: true, msg: 'Notificación eliminada' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const borrarTodasLasNotificacionesMedicas = async (req, res) => {
    try {
        const uid = req.uid;
        await NotificacionMedica.deleteMany({ usuario: uid });
        return res.json({ ok: true, msg: 'Historial médico vaciado' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

module.exports = {
    recibirAlertaDesdeLaravel,
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas
};
