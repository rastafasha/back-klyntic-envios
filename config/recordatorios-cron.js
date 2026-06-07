const cron = require('node-cron');
const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const axios = require('axios'); // Asegúrate de tener axios en tu proyecto (npm i axios)
const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

// 1. Configuración de Nodemailer usando las variables de tu dominio propio
const transporter = nodemailer.createTransport(smtpTransport({
    host: process.env.HOST_EMAIL, 
    port: process.env.PORT_EMAIL,
    secure: true,
    auth: {
        user: process.env.EMAIL_BACKEND, 
        pass: process.env.PASSWORD_APP  
    }
}));

// Se ejecuta cada 15 minutos automáticamente desde la nube de Render
cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ [Klyntic Cron] Despertando reloj. Solicitando citas próximas a Laravel Compartido...');

    try {
        // 2. Le pedimos a tu Laravel las citas que tocan notificar en este bloque de 15 minutos
        // Protegemos el endpoint con un token secreto para que nadie externo pueda jalar datos médicos
        const urlLaravel = `${process.env.LARAVEL_API_URL}/api/v1/citas/pendientes-recordatorio`;
        
        const respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });

        const citasProximas = respuesta.data; // Esperamos un array de citas de MySQL

        if (!citasProximas || citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas para notificar en este bloque.');
            return;
        }

        // 3. Procesamos las citas que nos devolvió Laravel
        for (const cita of citasProximas) {
            const telefonoDestino = formatearTelefono(cita.telefono_paciente);
            const consultorioId = cita.consultorio_id.toString(); // ID de enlace para la carpeta de WhatsApp en Render

            // --- FLUJO DE WHATSAPP ---
            if (cita.enviar_whatsapp && telefonoDestino) {
                // Node busca el Chrome de este consultorio_id y dispara el mensaje que ya Laravel dejó redactado
                const enviadoWS = await enviarMensajeWhatsApp(consultorioId, telefonoDestino, cita.mensaje_whatsapp);
                
                if (enviadoWS) {
                    console.log(`💬 WhatsApp médico entregado para el consultorio: ${consultorioId}`);
                }
            }

            // --- FLUJO DE EMAIL ---
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
                    console.error(`❌ Error enviando correo a ${cita.email_paciente}:`, emailError.message);
                }
            }

            // 4. LE AVISAMOS A LARAVEL QUE YA SE NOTIFICARON PARA QUE LAS MARQUE COMO COMPLETADAS EN MYSQL
            // Esto evita que en los próximos 15 minutos se vuelva a enviar el mismo mensaje
            await axios.post(`${process.env.LARAVEL_API_URL}/api/v1/citas/marcar-notificada/${cita.cita_id}`, {}, {
                headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
            }).catch(err => console.error(`Error al actualizar estado de cita ${cita.cita_id} en Laravel:`, err.message));
        }

    } catch (error) {
        console.error('❌ Error en el cron extractor de recordatorios médicos:', error.message);
    }
});

// Limpia el string y le clava el 58 de Venezuela si arranca en 0
function formatearTelefono(tel) {
    if (!tel) return '';
    let limpio = tel.replace(/\D/g, '');
    if (limpio.startsWith('0')) {
        limpio = '58' + limpio.substring(1);
    }
    return limpio;
}
