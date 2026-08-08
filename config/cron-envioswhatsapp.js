const cron = require('node-cron');
const Consultorio = require('../models/consultorio'); // Tu modelo de Mongo

// Función auxiliar para generar retrasos asíncronos
const delay = ms => new Promise(res => setTimeout(res, ms));

// Generador de números aleatorios para simular comportamiento humano (entre 4 y 7 segundos)
const obtenerRetrasoHumano = () => Math.floor(Math.random() * (7000 - 4000 + 1)) + 4000;

// PROGRAMACIÓN: Se ejecuta cada minuto buscando citas con cron_state = 1
cron.schedule('* * * * *', async () => {
    console.log('⏳ [CRON KLYNTIC] Revisando cola de mensajes pendientes...');
    
    try {
        // 1. Buscamos todas las citas pendientes en tu base de datos
        // Nota: Asumo que tienes un modelo Cita o Notificacion en tu microservicio.
        // Si la data viene de Laravel por API, aquí harías el fetch a Laravel.
        const notificacionesPendientes = await Notificacion.find({ estado_envio: 'PENDIENTE' }).limit(20);

        if (notificacionesPendientes.length === 0) {
            console.log('💤 No hay citas médicas próximas para notificar en este minuto.');
            return;
        }

        console.log(`✉️ Se encontraron ${notificacionesPendientes.length} notificaciones pendientes por procesar.`);

        // 2. Iteramos secuencialmente (NUNCA usar forEach con async/await, destruye la RAM)
        for (const noti of notificacionesPendientes) {
            const idDoctor = String(noti.doctorId);
            const clienteWhatsApp = global.whatsappClients[idDoctor];

            // Verificamos si este médico específico tiene su canal encendido y listo en RAM
            if (!clienteWhatsApp || !global.whatsappStates[idDoctor] || global.whatsappStates[idDoctor].whatsappStatus !== 'CONECTADO') {
                console.log(`⚠️ Doctor ID ${idDoctor} tiene mensajes pendientes pero su WhatsApp está DESCONECTADO.`);
                continue; // Saltamos al siguiente mensaje sin romper el ciclo
            }

            try {
                // Formateamos el número al estándar internacional de WhatsApp (@c.us)
                const numeroDestino = `${noti.telefono_paciente}@c.us`;
                
                console.log(`📤 Enviando recordatorio al paciente de la clínica del Doctor ${idDoctor}...`);
                
                // Envió físico del mensaje a través de la instancia Puppeteer del médico
                await clienteWhatsApp.sendMessage(numeroDestino, noti.mensaje_texto);

                // 3. Actualizamos el estado de la notificación a EXITOSO
                noti.estado_envio = 'ENVIADO';
                noti.enviado_at = new Date();
                await noti.save();

                console.log(`✅ Mensaje entregado con éxito a ${noti.telefono_paciente}`);

                // 🚀 EL SECRETO ANTI-BANEO: Esperamos un tiempo aleatorio humano antes del siguiente envío
                const tiempoEspera = obtenerRetrasoHumano();
                console.log(`⏱️ Protegiendo número del médico. Esperando ${tiempoEspera / 1000} segundos antes del siguiente...`);
                await delay(tiempoEspera);

            } catch (envioError) {
                console.error(`❌ Falló el envío físico para el paciente ${noti.telefono_paciente}:`, envioError.message);
                noti.estado_envio = 'FALLIDO';
                noti.error_log = envioError.message;
                await noti.save();
            }
        }

    } catch (globalCronError) {
        console.error('❌ Error crítico dentro del ciclo del Cron Job:', globalCronError.message);
    }
});
