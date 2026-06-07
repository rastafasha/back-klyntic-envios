'use strict'
// 📦 Los únicos dos modelos que necesita MongoDB para Klyntic
const PushSubscription = require('../models/push-subscription');
const { sendNotification } = require('../helpers/sendNotification'); 

// 1. Guardar Suscripción del Navegador o Teléfono del Paciente/Médico
const guardarSuscripcion = async (req, res) => {
    try {
        const subscription = req.body;
        const uid = req.uid; // ID del usuario que viene desde el login/token de Laravel

        // Guardamos o actualizamos el dispositivo en Mongo vinculándolo al ID de MySQL
        await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint }, 
            { usuario: uid, subscription: subscription },
            { upsert: true, new: true }
        );

        // 🔥 CORREGIDO: Eliminamos el 'Usuario.findByIdAndUpdate' porque los usuarios viven en MySQL
        
        // Mensaje de bienvenida asíncrono usando el helper adaptado
        await sendNotification(
            subscription, 
            '¡Bienvenido a Klyntic! 🏥', 
            'Ahora recibirás tus alertas y llamados médicos aquí.',
            '/dashboard',
            uid,
            'AVISO_GENERAL'
        );
        
        res.status(201).json({ ok: true, msg: 'Suscripción guardada con éxito' });
    } catch (error) {
        console.error('Error en guardarSuscripcion:', error);
        res.status(500).json({ ok: false, msg: 'Error al guardar suscripción' });
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
