const cron = require('node-cron');
const NotificacionCola = require('../models/notificacionCola'); // Tu modelo de la cola de Mongo
const axios = require('axios');

const delay = ms => new Promise(res => setTimeout(res, ms));
const obtenerRetrasoHumano = () => Math.floor(Math.random() * (7000 - 4000 + 1)) + 4000;

// PROGRAMACIÓN: Se ejecuta cada minuto buscando registros en MongoDB con estado = 'PENDIENTE'
cron.schedule('* * * * *', async () => {
    console.log('⏳ [DEMONIO WHATSAPP] Revisando mensajes en cola de MongoDB...');
    
    try {
        // Tomamos un bloque máximo de 20 mensajes para procesar con calma y no levantar sospechas de spam
        const pendientes = await NotificacionCola.find({ estado: 'PENDIENTE' }).limit(20);

        if (pendientes.length === 0) {
            console.log('💤 Cola vacía. No hay mensajes de WhatsApp pendientes en este minuto.');
            return;
        }

        console.log(`✉️ Procesando ráfaga de ${pendientes.length} recordatorios desde la cola...`);

        const urlBase = process.env.LARAVEL_API_URL;
        const urlBaseLimpia = urlBase ? (urlBase.endsWith('/') ? urlBase.slice(0, -1) : urlBase) : '';

        for (const noti of pendientes) {
            const idDoctor = String(noti.consultorio_id);
            
            // Buscamos si la instancia de WhatsApp de este médico está activa en la memoria RAM del servidor
            const clienteWhatsApp = global.whatsappClients && global.whatsappClients[idDoctor];
            const estadoWhatsApp = global.whatsappStates && global.whatsappStates[idDoctor];

            if (!clienteWhatsApp || !estadoWhatsApp || estadoWhatsApp.whatsappStatus !== 'CONECTADO') {
                console.log(`⚠️ El Consultorio ID ${idDoctor} tiene mensajes listos, pero su WhatsApp está DESCONECTADO en RAM.`);
                continue; // Pasa al siguiente mensaje; este se queda en 'PENDIENTE' para la próxima vuelta
            }

            try {
                const numeroDestino = `${noti.telefono}@c.us`;
                console.log(`📤 Despachando mensaje de WhatsApp al número: ${numeroDestino}...`);
                
                // Disparo físico a través del Chromium de ese doctor
                await clienteWhatsApp.sendMessage(numeroDestino, noti.mensaje);

                // 1. Marcamos como exitoso en MongoDB
                noti.estado = 'ENVIADO';
                noti.enviado_at = new Date();
                await noti.save();
                console.log(`✅ Mensaje enviado en WhatsApp al paciente: ${noti.telefono}`);

                // 2. Reportamos de vuelta a Laravel Core para apagar el cron_state de la cita
                if (urlBaseLimpia && noti.referenciaId) {
                    const urlUpdate = `${urlBaseLimpia}/api/appointments/update-cron-state/${noti.referenciaId}`;
                    await axios.post(urlUpdate, {}, {
                        headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
                    }).catch(e => console.error(`⚠️ Error al actualizar cita ${noti.referenciaId} en Laravel:`, e.message));
                }

                // 🚀 SISTEMA ANTI-BANEO: Pausa aleatoria imitando escritura humana
                const tiempoEspera = obtenerRetrasoHumano();
                console.log(`⏱️ Evitando bloqueos. Pausando ${tiempoEspera / 1000} segundos antes del siguiente...`);
                await delay(tiempoEspera);

            } catch (envioError) {
                console.error(`❌ Error en la entrega física para el número ${noti.telefono}:`, envioError.message);
                noti.estado = 'FALLIDO';
                noti.intentos = (noti.intentos || 0) + 1;
                noti.error_log = envioError.message;
                
                // Si falla más de 3 veces, lo sacamos de la cola marcándolo como fallido definitivo
                if (noti.intentos >= 3) {
                    noti.estado = 'FALLIDO_PERMANENTE';
                }
                await noti.save();
            }
        }

    } catch (globalCronError) {
        console.error('❌ Error crítico dentro del bucle del cron de WhatsApp:', globalCronError.message);
    }
});
