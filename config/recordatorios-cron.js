const axios = require('axios');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu modelo de la cola de Mongo

async function ejecutarRecordatorios() {
    console.log('⏰ [Klyntic Cron Extractor] Despertando reloj nativo de Render...');
    
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
            // Ignoramos errores, solo queremos levantar el contenedor de Render
        }

        console.log('⏳ Laravel se está encendiendo. Esperando 50 segundos antes de pedir las citas...');
        await new Promise(resolve => setTimeout(resolve, 50000));

        console.log('📡 Consultando citas próximas en Laravel...');
        respuesta = await axios.get(urlLaravel, {
            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
        });

    } catch (apiError) {
        console.error('⚠️ Laravel devolvió un error al consultar citas:', apiError.message);
        console.log('💤 Cancelando iteración actual por falta de conexión válida.');
        return;
    }

    try {
        const citasProximas = Array.isArray(respuesta.data) 
            ? respuesta.data 
            : (respuesta.data.data || []);

        if (citasProximas.length === 0) {
            console.log('💤 No hay citas médicas próximas con [cron_state = 1] para notificar.');
            return; 
        }

        console.log(`📦 Se encontraron ${citasProximas.length} citas pendientes. Encolando en MongoDB...`);

        // 🔄 ENCOLADO MASIVO SEGURO EN MONGODB
        for (const cita of citasProximas) {
            try {
                let telefonoLimpio = String(cita.phone || cita.telefono || '').replace(/\D/g, '');
                if (telefonoLimpio.startsWith('0')) {
                    telefonoLimpio = '58' + telefonoLimpio.substring(1);
                }

                // Insertamos o actualizamos en la cola de MongoDB para que el cron de cada minuto lo procese
                await NotificacionMedica.findOneAndUpdate(
                    { referenciaId: String(cita.id) }, 
                    {
                        consultorio_id: String(cita.doctor_id || cita.consultorio_id),
                        telefono: telefonoLimpio,
                        mensaje: cita.mensaje || `Hola, le recordamos su cita médica programada para la fecha: ${cita.date_appointment}.`,
                        estado: 'PENDIENTE', // Queda listo para el demonio de node-cron
                        intentos: 0
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

            } catch (errorEncolado) {
                console.error(`❌ Error al meter en cola la cita ID ${cita.id}:`, errorEncolado.message);
                continue;
            }
        }

        console.log('🚀 [Klyntic Cron Extractor] Lote encolado en MongoDB con éxito. Saliendo del proceso.');
        return;

    } catch (error) {
        console.error('❌ Error general inesperado en el extractor médico:', error.message);
        return;
    }
}

module.exports = { ejecutarRecordatorios };
