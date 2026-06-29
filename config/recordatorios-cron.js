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
    
    // 🛡️ CONTROL DE SEGURIDAD: Evita URLs inválidas si Render no tiene las variables cargadas
    if (!process.env.LARAVEL_API_URL) {
        console.error('❌ ERROR CRÍTICO: La variable LARAVEL_API_URL no está definida en el entorno.');
        process.exit(1); 
    }
    if (!process.env.WEBHOOK_SECRET_TOKEN) {
        console.error('❌ ERROR CRÍTICO: La variable WEBHOOK_SECRET_TOKEN no está definida.');
        process.exit(1);
    }

    try {
        // 🔗 1. CONECTAMOS DIRECTO AL ENDPOINT GLOBAL (Una sola petición para todas las citas)
        const urlLaravel = `${process.env.LARAVEL_API_URL}/api/appointments/cron-pendientes`;
        
        const respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });

        // Tu pendientesCron() de Laravel devuelve el array directo gracias al Collection
        const citasProximas = respuesta.data;

        if (!citasProximas || citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas con [cron_state = 1] para notificar.');
            process.exit(0); 
        }

        console.log(`📦 Se encontraron ${citasProximas.length} citas pendientes por procesar...`);

        // 🔄 2. ITERAMOS DIRECTAMENTE LAS CITAS RECIBIDAS (Sin pasar por doctores)
        for (const cita of citasProximas) {
            // Nota: Soporta si tu Collection expone la llave como 'id' o como 'cita_id'
            const citaId = cita.id || cita.cita_id; 
            const telefonoDestino = formatearTelefono(cita.telefono_paciente);
            const consultorioId = cita.consultorio_id ? cita.consultorio_id.toString() : 'Sin ID';

            // Enviar mensaje por WhatsApp
            if (cita.enviar_whatsapp && telefonoDestino) {
                const enviadoWS = await enviarMensajeWhatsApp(consultorioId, telefonoDestino, cita.mensaje_whatsapp);
                if (enviadoWS) console.log(`💬 WhatsApp médico entregado para la cita: ${citaId}`);
            }

            // Enviar mensaje por Correo Electrónico
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
                    console.error(`❌ Error enviando correo para cita ${citaId}:`, emailError.message);
                }
            }

            // 🔄 3. ACTUALIZACIÓN: Cambiamos el cron_state de la cita llamando a tu nuevo método en Laravel
            const urlUpdate = `${process.env.LARAVEL_API_URL}/api/appointments/update-cron-state/${citaId}`;

            await axios.post(urlUpdate, {}, {
                headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
            })
            .then(() => console.log(`✅ Cita ${citaId} marcada como procesada (cron_state = 2).`))
            .catch(err => console.error(`❌ Error al actualizar cron_state de la cita ${citaId} en Laravel:`, err.message));
        }

        console.log('🚀 [Klyntic Cron] Proceso terminado con éxito de forma limpia.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error general en el extractor médico:', error.message);
        process.exit(1); 
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
