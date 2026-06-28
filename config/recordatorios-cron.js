const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');
const axios = require('axios');
const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

const transporter = nodemailer.createTransport(smtpTransport({
    host: process.env.HOST_EMAIL, 
    port: process.env.PORT_EMAIL,
    secure: true,
    auth: {
        user: process.env.EMAIL_BACKEND, 
        pass: process.env.PASSWORD_APP  
    }
}));

// FUNCIÓN PRINCIPAL DIRECTA (SIN NODE-CRON)
async function ejecutarRecordatorios() {
    console.log('⏰ [Klyntic Cron] Despertando reloj nativo de Render...');
    try {
        const urlLaravel = `${process.env.LARAVEL_API_URL}/api/v1/citas/pendientes-recordatorio`;
        const respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });

        const citasProximas = respuesta.data;

        if (!citasProximas || citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas para notificar.');
            process.exit(0); // Cerramos el proceso con éxito
        }

        for (const cita of citasProximas) {
            const telefonoDestino = formatearTelefono(cita.telefono_paciente);
            const consultorioId = cita.consultorio_id.toString();

            if (cita.enviar_whatsapp && telefonoDestino) {
                const enviadoWS = await enviarMensajeWhatsApp(consultorioId, telefonoDestino, cita.mensaje_whatsapp);
                if (enviadoWS) console.log(`💬 WhatsApp médico entregado: ${consultorioId}`);
            }

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

            await axios.post(`${process.env.LARAVEL_API_URL}/api/v1/citas/marcar-notificada/${cita.cita_id}`, {}, {
                headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
            }).catch(err => console.error(`Error al actualizar estado en Laravel:`, err.message));
        }

        process.exit(0); // Apaga el script limpiamente al finalizar la lista

    } catch (error) {
        console.error('❌ Error en el extractor médico:', error.message);
        process.exit(1); // Cierra con código de error si colapsa
    }
}

function formatearTelefono(tel) {
    if (!tel) return '';
    let limpio = tel.replace(/\D/g, '');
    if (limpio.startsWith('0')) {
        limpio = '58' + limpio.substring(1);
    }
    return limpio;
}

// Disparamos la ejecución al encender el contenedor
ejecutarRecordatorios();
