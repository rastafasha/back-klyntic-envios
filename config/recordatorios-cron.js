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
    
    if (!process.env.LARAVEL_API_URL || !process.env.WEBHOOK_SECRET_TOKEN) {
        console.error('❌ ERROR CRÍTICO: Faltan variables de entorno esenciales.');
        return; // Retornamos en lugar de apagar el proceso
    }

    let respuesta;
    try {
        const urlLaravel = `${process.env.LARAVEL_API_URL}/api/appointments/cron-pendientes`;
        
        // Intentamos obtener las citas pendientes
        respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });
    } catch (apiError) {
        // SI EL ENDPOINT DA 404, AQUÍ LO ATRAPAMOS SIN QUE SE DETENGA EL SERVIDOR
        console.error('⚠️ Laravel devolvió un error al consultar citas (Posible 404 por datos simulados):', apiError.message);
        console.log('💤 Cancelando iteración actual por falta de conexión válida.');
        return; // Detiene la ejecución de este ciclo de forma segura sin matar el proceso de Node
    }

    try {
        const citasProximas = Array.isArray(respuesta.data) 
            ? respuesta.data 
            : (respuesta.data.data || []);

        if (citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas con [cron_state = 1] para notificar.');
            return;
        }

        console.log(`📦 Se encontraron ${citasProximas.length} citas pendientes por procesar...`);

        for (const cita of citasProximas) {
            const citaId = cita.id || cita.cita_id; 
            const telefonoDestino = formatearTelefono(cita.telefono_paciente);
            const consultorioId = cita.consultorio_id ? cita.consultorio_id.toString() : 'Sin ID';

            // Enviar mensaje por WhatsApp
            if (cita.enviar_whatsapp && telefonoDestino) {
                try {
                    const enviadoWS = await enviarMensajeWhatsApp(consultorioId, telefonoDestino, cita.mensaje_whatsapp);
                    if (enviadoWS) console.log(`💬 WhatsApp médico entregado para la cita: ${citaId}`);
                } catch (wsError) {
                    console.error(`❌ Error en módulo WhatsApp para cita ${citaId}:`, wsError.message);
                }
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

            // Actualización de estado controlada
            const urlUpdate = `${process.env.LARAVEL_API_URL}/api/appointments/update-cron-state/${citaId}`;
            try {
                await axios.post(urlUpdate, {}, {
                    headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
                });
                console.log(`✅ Cita ${citaId} marcada como procesada (cron_state = 2).`);
            } catch (updateError) {
                console.warn(`⚠️ Aviso: No se pudo actualizar el estado de la cita ${citaId} en Laravel:`, updateError.message);
            }
        }

        console.log('🚀 [Klyntic Cron] Proceso terminado con éxito de forma limpia.');

    } catch (error) {
        console.error('❌ Error general inesperado en el extractor médico:', error.message);
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
