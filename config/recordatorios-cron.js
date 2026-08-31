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
        process.exit(1);
    }

    let respuesta;
    try {
        const urlBase = process.env.LARAVEL_API_URL;
        const urlBaseLimpia = urlBase.endsWith('/') ? urlBase.slice(0, -1) : urlBase;
        const urlLaravel = `${urlBaseLimpia}/api/appointments/cron-pendientes`;
        
        console.log('💤 Enviando señal para despertar al backend de Laravel...');
        try {
            await axios.get(urlBaseLimpia, { timeout: 8000 }); 
        } catch (e) {
            // Ignoramos errores aquí, solo queremos que Render empiece a encenderlo
        }

        console.log('⏳ Laravel se está encendiendo. Esperando 50 segundos antes de pedir las citas...');
        await new Promise(resolve => setTimeout(resolve, 50000));

        console.log('📡 Consultando citas pendientes en Laravel...');
        respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });

    } catch (apiError) {
        console.error('⚠️ Laravel devolvió un error al consultar citas:', apiError.message);
        console.log('💤 Cancelando iteración actual por falta de conexión válida.');
        process.exit(0); 
    }

    try {
        const citasProximas = Array.isArray(respuesta.data) 
            ? respuesta.data 
            : (respuesta.data.data || []);

        if (citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas con [cron_state = 1] para notificar.');
            process.exit(0); 
        }

        console.log(`📦 Se encontraron ${citasProximas.length} citas pendientes por procesar...`);

        const urlBase = process.env.LARAVEL_API_URL;
        const urlBaseLimpia = urlBase.endsWith('/') ? urlBase.slice(0, -1) : urlBase;

        // 👇 BUCLE COMPLETADO PARA TU ARQUITECTURA DE MICROSERVICIO 👇
        for (const cita of citasProximas) {
            try {
                console.log(`🔹 Microservicio procesando cita ID: ${cita.id}...`);
                
                // 1. Aquí colocas la lógica de envío de tu microservicio (ej. WhatsApp, SMS, Mail)
                // Ejemplo: await tuLógicaDeEnvio(cita);
                
                // 2. Reportamos de vuelta a Laravel que la cita fue notificada con éxito
                const urlUpdate = `${urlBaseLimpia}/api/appointments/update-cron-state/${cita.id}`;
                
                await axios.post(urlUpdate, {}, {
                    headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
                });
                
                console.log(`✅ Cita ID ${cita.id} procesada y notificada a Laravel correctamente.`);

            } catch (errorCita) {
                console.error(`❌ Error al procesar o reportar la cita ${cita.id}:`, errorCita.message);
                // Si una cita falla, usamos 'continue' para saltar a la siguiente sin romper el flujo completo
                continue; 
            }
        }
        // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

        console.log('🚀 [Klyntic Cron] Proceso terminado con éxito de forma limpia.');
        process.exit(0); 

    } catch (error) {
        console.error('❌ Error general inesperado en el extractor médico:', error.message);
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
// ejecutarRecordatorios();

module.exports = { ejecutarRecordatorios };
