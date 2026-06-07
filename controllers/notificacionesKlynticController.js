const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu esquema médico en Mongo
const Consultorio = require('../models/consultorio');

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



const enviarRecordatoriosMasivos = async (req, res) => {
    try {
        const { recordatorios } = req.body; 

        // Validación de seguridad para el payload JSON de Laravel
        if (!recordatorios || !Array.isArray(recordatorios)) {
            return res.status(400).json({ status: 'error', message: 'Formato de datos inválido' });
        }

        // 🧠 RESPUESTA INMEDIATA: Cerramos la conexión con Laravel en milisegundos
        res.status(200).json({ status: 'ok', message: 'Procesando lote de notificaciones en Klyntic...' });

        console.log(`=== 📦 KLYNTIC BULK: Procesando lote de ${recordatorios.length} recordatorios ===`);

        // Procesamos la ráfaga de mensajes en segundo plano dentro de Node.js
        for (const item of recordatorios) {
            const { doctor_id, telefono, mensaje } = item;

            // 1. Validamos en MongoDB si el consultorio del doctor está CONECTADO
            const consultorio = await Consultorio.findById(doctor_id);

            if (consultorio && consultorio.whatsappStatus === 'CONECTADO') {
                
                // 🚀 DISPARO REAL: Invocamos al motor de WhatsApp heredado de restaurantes
                // El helper se encarga de isRegisteredUser, enviar el mensaje y registrar en consola
                const enviado = await enviarMensajeWhatsApp(doctor_id, telefono, mensaje);
                
                if (enviado) {
                    console.log(`[ÉXITO] Recordatorio enviado al paciente ${telefono} desde el canal del Doctor ID: ${doctor_id}`);
                } else {
                    console.log(`[FALLO] No se pudo entregar el mensaje al número ${telefono} a través del helper.`);
                }

            } else {
                console.log(`[IGNORADO] El consultorio ${doctor_id} está DESCONECTADO. No se puede enviar el mensaje a ${telefono}.`);
            }
        }

    } catch (error) {
        // Como ya respondimos 200 a Laravel, los errores se quedan exclusivamente en tu consola local
        console.error('❌ Error crítico en el bulk de notificaciones Klyntic:', error);
    }
};




module.exports = {
    recibirAlertaDesdeLaravel,
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas,
    enviarRecordatoriosMasivos
};
