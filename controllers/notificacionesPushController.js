'use strict'
// 📦 Los únicos dos modelos que necesita MongoDB para Klyntic
const PushSubscription = require('../models/push-subscription');
const { sendNotification } = require('../helpers/sendNotification'); 

// 1. Guardar Suscripción del Navegador o Teléfono del Paciente/Médico
const guardarSuscripcion = async (req, res) => {
    try {
        const { endpoint, expirationTime, keys, userId } = req.body;
        
        // 🚀 CAPTURA MAESTRA: Leemos el userId que viaja en el body, o caemos en los headers
        const uid = userId || req.header('x-uid') || req.header('X-Uid') || req.uid || 'GUEST'; 

        if (!endpoint) {
            return res.status(400).json({ ok: false, msg: 'Suscripción inválida o incompleta' });
        }

        console.log(`💾 [MONGO SYNC] Vinculando dispositivo al ID de usuario real: ${uid}`);

        // Reestructuramos el objeto tal como lo espera recibir la colección
        const subscriptionData = { endpoint, expirationTime, keys };

        // Guardamos o actualizamos en Mongo asegurando que el campo 'usuario' grabe el ID físico real
        await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': endpoint }, 
            { usuario: String(uid).trim(), subscription: subscriptionData }, // 🟢 GRABA EL ID REAL EN VEZ DE 'GUEST'
            { upsert: true, new: true }
        );

        // 🔒 SOLUCIÓN AL VALIDATION ERROR DE MONGOOSE:
        // Adaptamos el llamado para que cumpla estrictamente con las reglas de tu esquema 'NotificacionMedica'
        try {
            await sendNotification(
                subscriptionData, 
                '¡Bienvenido a Klyntic! 🏥', 
                'Ahora recibirás tus alertas y llamados médicos aquí.',
                '/medical',
                String(uid).trim(),
                'PAGO_RECIBIDO', // 🟢 Cambiamos 'AVISO_GENERAL' por un Enum que sí exista en tu esquema (ej: 'PAGO_RECIBIDO')
                null
            );
            console.log('🔔 Mensaje de bienvenida nativo enviado con éxito.');
        } catch (pushError) {
            console.warn('⚠️ No se pudo enviar el push de bienvenida inmediato:', pushError.message);
        }
        
        return res.status(201).json({ ok: true, msg: 'Suscripción guardada con éxito', usuarioAsociado: uid });

    } catch (error) {
        console.error('❌ Error crítico en guardarSuscripcion:', error);
        return res.status(500).json({ ok: false, msg: 'Error al guardar suscripción en el servidor de envíos' });
    }
};

// 2. Envío Individual (El helper centraliza el Socket y la BD de Klyntic)
const enviarPushIndividual = async (req, res) => {
    try {
        const { destinatarioId, mensaje, remitenteNombre, tipo = 'CITA_AGENDADA', referenciaId = null } = req.body;
        const titulo = '¡Actualización Médica! 🏥';
        const cuerpo = `De ${remitenteNombre}: ${mensaje}`;
        const urlRedireccion = '/paciente/citas';

        // 🌐 SEGUNDO PLANO: Buscamos los dispositivos registrados del paciente en Mongo
        const subs = await PushSubscription.find({ usuario: destinatarioId });

        if (subs.length === 0) {
            // Si el paciente no tiene Web Push (como tu iPhone 6s sin soporte push),
            // el helper igual guardará el historial en BD y emitirá por Sockets (global.io)
            await sendNotification(null, titulo, cuerpo, urlRedireccion, destinatarioId, tipo, referenciaId);
        } else {
            // Si tiene dispositivos Web Push, disparamos a cada uno
            const promesas = subs.map(s => 
                sendNotification(s.subscription, titulo, cuerpo, urlRedireccion, destinatarioId, tipo, referenciaId)
                    .catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 404) s.deleteOne(); 
                    })
            );
            await Promise.all(promesas);
        }

        res.json({ ok: true, msg: 'Envío híbrido procesado' });
    } catch (error) {
        console.error('Error en enviarPushIndividual:', error);
        res.status(500).json({ ok: false, msg: 'Error al enviar' });
    }
};

// 3. Envío Masivo (Para alertas generales de la clínica)
const enviarPushATodos = async (req, res) => {
    const { titulo, mensaje } = req.body;
    try {
        if (global.io) {
            const notifMasiva = { titulo, mensaje, tipo: 'AVISO_GENERAL', createdAt: new Date() };
            global.io.emit('notificacion-recibida', notifMasiva);
        }

        const suscripciones = await PushSubscription.find();
        if (suscripciones.length === 0) return res.json({ ok: true, msg: 'No hay dispositivos registrados' });

        const promesas = suscripciones.map(s => 
            sendNotification(s.subscription, titulo, mensaje, '/dashboard', s.usuario, 'AVISO_GENERAL')
                .catch(err => { if (err.statusCode === 410 || err.statusCode === 404) s.deleteOne(); })
        );

        await Promise.all(promesas);
        res.json({ ok: true, msg: `Enviado a ${suscripciones.length} dispositivos médicos.` });
    } catch (error) {
        console.error('Error en masivo:', error);
        res.status(500).json({ ok: false, msg: 'Error en masivo' });
    }
};

module.exports = {
    guardarSuscripcion,
    enviarPushIndividual,
    enviarPushATodos
};
