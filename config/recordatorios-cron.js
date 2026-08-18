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
        process.exit(1); // 🚀 CORRECCIÓN: Apaga con error para que Render te avise
    }

    let respuesta;
    try {
        const urlLaravel = `${process.env.LARAVEL_API_URL}/api/appointments/cron-pendientes`;
        
        respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });
    } catch (apiError) {
        console.error('⚠️ Laravel devolvió un error al consultar citas:', apiError.message);
        console.log('💤 Cancelando iteración actual por falta de conexión válida.');
        process.exit(0); // 🚀 CORRECCIÓN: Apaga el contenedor de inmediato de forma limpia
    }

    try {
        const citasProximas = Array.isArray(respuesta.data) 
            ? respuesta.data 
            : (respuesta.data.data || []);

        if (citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas con [cron_state = 1] para notificar.');
            process.exit(0); // 🚀 CORRECCIÓN: Apaga el contenedor ya que no hay trabajo
        }

        console.log(`📦 Se encontraron ${citasProximas.length} citas pendientes por procesar...`);

        for (const cita of citasProximas) {
            // ... (Manten tu bucle for idéntico como lo tienes) ...
        }

        console.log('🚀 [Klyntic Cron] Proceso terminado con éxito de forma limpia.');
        process.exit(0); // 🚀 CORRECCIÓN: Éxito total. Matamos el proceso para que Render corte la factura.

    } catch (error) {
        console.error('❌ Error general inesperado en el extractor médico:', error.message);
        process.exit(1); // Apaga informando el error inesperado
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
