'use strict'
// 📦 Los únicos dos modelos que necesita MongoDB para Klyntic
const PushSubscription = require('../models/push-subscription');
const { sendNotification } = require('../helpers/sendNotification'); 

// 1. Guardar Suscripción del Navegador o Teléfono del Paciente/Médico
const guardarSuscripcion = async (req, res) => {
    try {
        const subscription = req.body;
        
        // 🟢 RESPALDO CONTRA EL 500: Si req.uid viene nulo del middleware por desfase del token, 
        // buscamos si viene en los headers o dejamos un string vacío temporal para evitar que truene.
        const uid = req.uid || req.header('x-uid') || 'GUEST_USER'; 

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ ok: false, msg: 'Suscripción inválida o incompleta' });
        }

        // Guardamos o actualizamos el dispositivo en Mongo vinculándolo al ID de MySQL
        await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint }, 
            { usuario: uid, subscription: subscription },
            { upsert: true, new: true }
        );

        // 🔒 AISLAMIENTO DEL MENSAJE DE BIENVENIDA:
        // Envolvemos el envío en su propio try/catch. Si el servicio de Web Push de Google/Apple 
        // o las llaves VAPID fallan en el primer milisegundo, se registra el error en consola, 
        // pero la petición HTTP terminará con éxito (201) hacia Angular. ¡Adiós desfase!
        try {
            await sendNotification(
                subscription, 
                '¡Bienvenido a Klyntic! 🏥', 
                'Ahora recibirás tus alertas y llamados médicos aquí.',
                '/dashboard',
                uid,
                'AVISO_GENERAL'
            );
            console.log('🔔 Mensaje de bienvenida enviado con éxito');
        } catch (pushError) {
            console.warn('⚠️ No se pudo enviar el push de bienvenida inmediato:', pushError.message);
            // No hacemos nada más; dejamos que el flujo principal continúe de forma segura
        }
        
        // Retornamos éxito garantizado a Angular al primer intento
        return res.status(201).json({ ok: true, msg: 'Suscripción guardada con éxito' });

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
