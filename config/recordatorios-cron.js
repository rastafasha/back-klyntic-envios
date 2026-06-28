const express = require('express');
const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const axios = require('axios');
const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

const app = express();
app.use(express.json()); // Permite leer el cuerpo JSON del ping de Laravel

const PORT = process.env.PORT || 3000;

const transporter = nodemailer.createTransport(smtpTransport({
  host: process.env.HOST_EMAIL,
  port: process.env.PORT_EMAIL,
  secure: true,
  auth: {
    user: process.env.EMAIL_BACKEND,
    pass: process.env.PASSWORD_APP
  }
}));

// RUTA QUE RECIBE EL PING DESDE LARAVEL
app.post('/webhook/ejecutar-recordatorios', async (req, res) => {
  console.log('⏰ [Klyntic Cron] Ping recibido desde Laravel. Iniciando proceso...');
  
  // Validación de seguridad: Verifica el Token enviado por Laravel
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}`) {
    console.error('❌ Intento de acceso no autorizado al webhook.');
    return res.status(401).json({ error: 'No autorizado' });
  }

  // RESPUESTA INMEDIATA A LARAVEL: Evita que Laravel deje la conexión colgada o dé timeout
  res.status(202).json({ mensaje: 'Proceso de recordatorios iniciado en segundo plano.' });

  // Ejecución en segundo plano para no bloquear la respuesta HTTP
  try {
    const urlBase = process.env.LARAVEL_API_URL;
    
    // Verificación estricta de la URL para evitar el error "Invalid URL"
    if (!urlBase || !urlBase.startsWith('http')) {
      throw new Error(`LARAVEL_API_URL no está configurada correctamente en Render. Valor actual: "${urlBase}"`);
    }

    const urlLaravel = `${urlBase}/api/v1/citas/pendientes-recordatorio`;
    const respuesta = await axios.get(urlLaravel, {
      headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
    });

    const citasProximas = respuesta.data;

    if (!citasProximas || citasProximas.length === 0) {
      console.log('💤 No hay citas médicas próximas para notificar.');
      return; // Salimos de la función, NO usamos process.exit()
    }

    for (const cita of citasProximas) {
      const telefonoDestino = formatearTelefono(cita.telefono_paciente);
      const consultorioId = cita.consultorio_id ? cita.consultorio_id.toString() : '';

      // 1. Envío de WhatsApp
      if (cita.enviar_whatsapp && telefonoDestino) {
        try {
          const enviadoWS = await enviarMensajeWhatsApp(consultorioId, telefonoDestino, cita.mensaje_whatsapp);
          if (enviadoWS) console.log(`💬 WhatsApp médico entregado: ${consultorioId}`);
        } catch (wsError) {
          console.error(`❌ Error enviando WhatsApp:`, wsError.message);
        }
      }

      // 2. Envío de Correo
      if (cita.enviar_email && cita.email_paciente) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_BACKEND,
            to: cita.email_paciente,
            subject: cita.asunto_email || 'Recordatorio de tu Cita Médica 🏥',
            text: cita.mensaje_email
          });
          console.log(`📧 Correo médico enviado a: ${cita.email_paciente}`);
        } catch (emailError) {
          console.error(`❌ Error enviando correo:`, emailError.message);
        }
      }

      // 3. Notificación de vuelta a Laravel
      try {
        await axios.post(`${urlBase}/api/v1/citas/marcar-notificada/${cita.cita_id}`, {}, {
          headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });
        console.log(`✅ Cita ${cita.cita_id} marcada como notificada.`);
      } catch (err) {
        console.error(`❌ Error al actualizar estado en Laravel para cita ${cita.cita_id}:`, err.message);
      }
    }

    console.log('🏁 Todos los recordatorios del ciclo actual fueron procesados.');

  } catch (error) {
    console.error('❌ Error crítico en el extractor médico:', error.message);
    // NOTA: Nunca uses process.exit() aquí, o tumbarás el servidor Express por completo.
  }
});

function formatearTelefono(tel) {
  if (!tel) return '';
  let limpio = tel.replace(/\D/g, '');
  if (limpio.startsWith('0')) {
    limpio = '58' + limpio.substring(1);
  }
  return limpio;
}

// INICIAR EL SERVIDOR EXPRESS (Se mantiene siempre encendido en Render)
app.listen(PORT, () => {
  console.log(`🚀 Servidor de Webhooks escuchando en el puerto ${PORT}`);
});
