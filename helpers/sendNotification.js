const webpush = require('web-push');
// 💥 AJUSTE 1: Importamos el nuevo modelo de Notificación Médica que creamos hace un momento
const NotificacionMedica = require('../models/notificacionMedica'); 

const vapidKeys = {
    "publicKey": process.env.VAPI_KEY_PUBLIC || '',
    "privateKey": process.env.VAPI_KEY_PRIVATE || ''
};

webpush.setVapidDetails(
    'mailto:mercadocreativo@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey,
);

/**
 * Helper Centralizado para Notificaciones Híbridas Médicas (Klyntic)
 */
const sendNotification = async (userSubscription, title, message, url = '/notificaciones', usuarioId = null, tipo = 'RECORDATORIO', referenciaId = null) => {
  
  let nuevaNotif = null;

  // 1. HISTORIAL: Guardamos la notificación en Mongo en la colección de Klyntic
  if (usuarioId) {
    try {
      // Evitamos duplicidad de alertas idénticas en menos de 5 segundos
      const yaExiste = await NotificacionMedica.findOne({
        usuario: usuarioId,
        tipo,
        createdAt: { $gte: new Date(Date.now() - 5000) } 
      });

      if (!yaExiste) {
        // 💥 AJUSTE 2: Usamos el modelo médico 'NotificacionMedica'
        nuevaNotif = new NotificacionMedica({
          usuario: usuarioId,
          titulo: title,
          mensaje: message,
          tipo,
          referenciaId
        });
        await nuevaNotif.save();
      } else {
        nuevaNotif = yaExiste; 
      }
    } catch (dbErr) {
      console.error('Error al guardar historial médico en Mongo:', dbErr);
    }
  }

  // 2. 🟢 TIEMPO REAL (SOCKET.IO): Para avisarle al doctor o paciente en la app abierta
  if (global.io && usuarioId) {
    const payloadSocket = nuevaNotif || { titulo: title, mensaje: message, tipo, referenciaId, createdAt: new Date() };
    global.io.to(usuarioId.toString()).emit('notificacion-recibida', payloadSocket);
    console.log(`[Socket Klyntic] Emitido a la sala del usuario: ${usuarioId}`);
  }

  // 3. 🌐 SEGUNDO PLANO (WEB PUSH): Para los teléfonos y navegadores
  if (userSubscription && userSubscription.endpoint) {
    const payloadPush = JSON.stringify({
      notification: {
        title,
        body: message,
        // 💥 AJUSTE 3: Apunta al dominio o assets oficiales de tu marca Klyntic
        icon: 'https://klyntic.vercel.app/assets/icons/icon-192x192.png', 
        vibrate: [100, 50, 100],
        data: { url }
      }
    });

    try {
      await webpush.sendNotification(userSubscription, payloadPush);
      console.log(`[WebPush Klyntic] Notificación enviada con éxito.`);
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[WebPush] Suscripción expirada en el endpoint.`);
        throw error; // Lanza el error para que el controlador limpie la sub obsoleta en Mongo
      }
    }
  }
};

module.exports = {
    sendNotification
};
