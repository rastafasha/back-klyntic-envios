const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu esquema médico en Mongo
const Consultorio = require('../models/consultorio');
const { MessageMedia } = require('whatsapp-web.js');
const { crearClienteWhatsApp } = require('../helpers/whatsapp-helper');
const colaWhatsApp = [];
let procesandoCola = false;

// Función auxiliar para pausar
const delay = ms => new Promise(res => setTimeout(res, ms));

// =========================================================================
// 🌐 EL WEBHOOK: Receptor de órdenes de Laravel (MySQL)
// =========================================================================
const recibirAlertaDesdeLaravel = async (req, res) => {
    try {
        // Recibimos tanto los datos de WhatsApp como los nuevos campos de la app de Klyntic
        const {
            consultorio_id,
            telefono,
            mensaje,
            usuario,          // ID del médico o paciente de MySQL
            rolDestinatario,  // 'MEDICO' o 'PACIENTE'
            titulo,           // Título para el Toastr de Angular
            tipo,             // El enum: 'PAGO_RECIBIDO', 'CITA_AGENDADA', etc.
            referenciaId      // ID del objeto en MySQL
        } = req.body;

        // =========================================================================
        // 🚀 TAREA 1: Notificación Interna en la App (MongoDB + WebSockets)
        // =========================================================================
        if (usuario && tipo) {
            const nuevaNotificacion = new NotificacionMedica({
                usuario,
                rolDestinatario,
                titulo,
                mensaje, // Usamos el mismo mensaje para ambos canales
                tipo,
                referenciaId
            });
            await nuevaNotificacion.save();

            // Emitimos por el WebSocket en tiempo real a la app de Angular
            if (req.io) {
                req.io.to(usuario).emit('recibir-alerta', nuevaNotificacion);
            }
        }

        // =========================================================================
        // 💬 TAREA 2: Encolado de WhatsApp Seguro (Anti-Colapso de RAM)
        // =========================================================================
        if (telefono) {
            let telefonoLimpio = telefono.replace(/\D/g, '');
            if (telefonoLimpio.startsWith('0')) {
                telefonoLimpio = '58' + telefonoLimpio.substring(1);
            }

            // 🚀 EN LUGAR DE PRENDER PUPPETEER EN CALIENTE, GUARDAMOS EN LA COLA DE MONGO
            // Esto protege tu servidor Render de picos de tráfico masivos
            const NotificacionCola = require('../models/notificacionCola'); // Creamos un modelo simple para la cola

            await NotificacionCola.findOneAndUpdate(
                { referenciaId: String(referenciaId) }, // Evita mensajes duplicados de la misma cita
                {
                    consultorio_id: String(consultorio_id),
                    telefono: telefonoLimpio,
                    mensaje: mensaje,
                    estado: 'PENDIENTE', // El Cron lo leerá en su próxima vuelta
                    intentos: 0
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).catch(err => console.error('❌ Error al guardar en cola de WhatsApp:', err.message));
        }


        // Respondemos de inmediato a Laravel
        return res.status(200).json({
            ok: true,
            msg: 'Orden de recordatorio y notificación interna procesadas por Node.'
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// =========================================================================
// 🔔 HISTORIAL Y INTERFAZ DE ANGULAR (MÉDICOS / PACIENTES)
// =========================================================================
const obtenerHistorialMedico = async (req, res) => {
    try {
        // 1. Extraemos el usuarioId de los parámetros o del token
        const usuarioId = req.params.id || req.uid;

        if (!usuarioId) {
            return res.status(400).json({ ok: false, msg: 'No se proporcionó el ID del usuario' });
        }

        // 2. 🔥 CAPTURAMOS LA PAGINACIÓN: Leemos el query string '?page=' (por defecto es 1)
        const pagina = parseInt(req.query.page, 10) || 1;
        const limitePorPagina = 10; // Cantidad de alertas que mostraremos por bloque
        const saltarRegistros = (pagina - 1) * limitePorPagina;

        // 3. Hacemos dos consultas en paralelo para que el servidor vuele:
        // Una trae las notificaciones de ese bloque y la otra cuenta el total general en Mongo
        const [notificaciones, totalNotificaciones] = await Promise.all([
            NotificacionMedica.find({ usuario: usuarioId })
                .sort({ fecha: -1 })
                .skip(saltarRegistros)
                .limit(limitePorPagina),
            NotificacionMedica.countDocuments({ usuario: usuarioId })
        ]);

        // 4. 🔥 CÁLCULO DEL PRÓXIMO: Si todavía quedan más registros por cargar, calculamos el número de la siguiente página
        const totalPaginas = Math.ceil(totalNotificaciones / limitePorPagina);
        const proximo = pagina < totalPaginas ? pagina + 1 : null;

        // Retornamos exactamente el objeto que tu interfaz de Angular está esperando
        return res.json({
            ok: true,
            notificaciones,
            proximo
        });

    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};


const obtenerContadorMedico = async (req, res) => {
    try {
        const uid = req.uid;
        const contador = await NotificacionMedica.countDocuments({ usuario: uid, leido: false });
        return res.json({ ok: true, unreadCount: contador });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const marcarUnaLeidaMedica = async (req, res) => {
    try {
        const notiId = req.params.id;
        const notificacion = await NotificacionMedica.findByIdAndUpdate(notiId, { leido: true }, { new: true });
        return res.json({ ok: true, notificacion });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const borrarNotificacionMedicaPorId = async (req, res) => {
    try {
        await NotificacionMedica.findByIdAndDelete(req.params.id);
        return res.json({ ok: true, msg: 'Notificación eliminada' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};

const borrarTodasLasNotificacionesMedicas = async (req, res) => {
    try {
        const uid = req.uid;
        await NotificacionMedica.deleteMany({ usuario: uid });
        return res.json({ ok: true, msg: 'Historial médico vaciado' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: error.message });
    }
};


const enviarRecordatoriosMasivos = async (req, res) => {
    try {
        const { recordatorios } = req.body;

        // Validación de seguridad para el payload JSON de Laravel
        if (!recordatorios || !Array.isArray(recordatorios)) {
            return res.status(400).json({ status: 'error', message: 'Formato de datos inválido' });
        }

        // 🧠 RESPUESTA INMEDIATA: Cerramos la conexión con Laravel en milisegundos
        res.status(200).json({ status: 'ok', message: 'Procesando lote de notificaciones en Klyntic...' });

        console.log(`=== 📦 KLYNTIC BULK: Procesando lote de ${recordatorios.length} recordatorios ===`);

        // Procesamos la ráfaga de mensajes en segundo plano dentro de Node.js
        for (const item of recordatorios) {
            const { doctor_id, telefono, mensaje } = item;
            const idDoctorStr = String(doctor_id);

            let clienteActivo = global.whatsappClients && global.whatsappClients[idDoctorStr];
            let estadoEnMemoria = global.whatsappStates && global.whatsappStates[idDoctorStr];
            // =========================================================================
            // 🚀 AUTO-DESPERTAR CLOUD INTELIGENTE (Dentro del bucle de enviarRecordatoriosMasivos)
            // =========================================================================
            if (!clienteActivo) {
                console.log(`🔍 [BULK AUTO-REVIVE] Consultorio ${idDoctorStr} no está en RAM. Buscando en MongoDB Atlas...`);

                const consultorioDB = await Consultorio.findById(idDoctorStr);

                if (consultorioDB && consultorioDB.whatsappStatus === 'CONECTADO') {
                    console.log(`🤖 [BULK AUTO-REVIVE] Sesión activa en Atlas. Levantando Puppeteer de forma segura...`);

                    // 🚀 Ejecutamos el encendido nativo asíncrono
                    crearClienteWhatsApp(idDoctorStr);

                    // 🚀 ESPERA DINÁMICA: Monitoreamos la RAM hasta que pase de INICIALIZANDO a CONECTADO
                    console.log(`⏳ Esperando la sincronización de Puppeteer en el entorno de Render...`);

                    await new Promise((resolve) => {
                        let intentosMaximos = 12; // 12 intentos * 5 segundos = Hasta 60 segundos de margen máximo
                        let contador = 0;

                        const verificarEstado = setInterval(() => {
                            contador++;

                            // Jalamas las variables globales actualizadas segundo a segundo por crearClienteWhatsApp
                            const clienteListo = global.whatsappClients && global.whatsappClients[idDoctorStr];
                            const estadoListo = global.whatsappStates && global.whatsappStates[idDoctorStr]?.whatsappStatus === 'CONECTADO';

                            if (clienteListo && estadoListo) {
                                console.log(`✅ [BULK AUTO-REVIVE] ¡Instancia operativa y en estado READY en el segundo ${contador * 5}!`);
                                clearInterval(verificarEstado);
                                resolve(true); // Rompe la promesa con éxito y continúa el envío
                            } else if (contador >= intentosMaximos) {
                                console.log(`❌ [BULK AUTO-REVIVE] Tiempo de espera límite alcanzado (60s). Chromium no respondió.`);
                                clearInterval(verificarEstado);
                                resolve(false); // Rompe la promesa por timeout
                            } else {
                                // Log informativo para saber en qué estado se encuentra atrapado Puppeteer
                                const estadoActual = global.whatsappStates && global.whatsappStates[idDoctorStr]?.whatsappStatus;
                                console.log(`⏳ [${contador}/12] Puppeteer se encuentra en estado: [${estadoActual || 'DESCONOCIDO'}] (${contador * 5}s)...`);
                            }
                        }, 5000); // Revisa la RAM cada 5 segundos
                    });

                    // Volvemos a jalar las referencias globales recién creadas y listas para disparar el mensaje
                    clienteActivo = global.whatsappClients[idDoctorStr];
                    estadoEnMemoria = global.whatsappStates[idDoctorStr];
                }
            }



            // =========================================================================
            // ⚡ DISPARO SEGURO CON LA INSTANCIA YA RECUPERADA
            // =========================================================================
            // Evaluamos si logramos levantar la sesión (o si ya estaba lista)
            if (clienteActivo) {

                let telefonoLimpio = telefono.replace(/\D/g, '');
                if (telefonoLimpio.startsWith('0')) {
                    telefonoLimpio = '58' + telefonoLimpio.substring(1);
                }
                if (!telefonoLimpio.endsWith('@c.us')) {
                    telefonoLimpio = `${telefonoLimpio}@c.us`;
                }

                try {
                    // Disparo real directo a la instancia de Puppeteer
                    await clienteActivo.sendMessage(telefonoLimpio, mensaje);
                    console.log(`[ÉXITO] Recordatorio enviado al paciente ${telefonoLimpio} desde el canal del Doctor ID: ${idDoctorStr}`);
                } catch (sendError) {
                    console.error(`[FALLO NATIVO] Error al entregar mensaje en WhatsApp para ${telefonoLimpio}:`, sendError.message);
                }

            } else {
                console.log(`[IGNORADO] El consultorio ${idDoctorStr} está DESCONECTADO y no se pudo auto-despertar. No se envía a ${telefono}.`);
            }

            // ⏳ Tu excelente pausa protectora anti-spam
            console.log(`⏱ Esperando 3.5 segundos antes del siguiente recordatorio...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
        }

    } catch (error) {
        console.error('❌ Error crítico en el bulk de notificaciones Klyntic:', error);
    }
};


const enviarNotificacionPaciente = async (req, res) => {
    try {
        const { consultorioId, numero, mensaje, urlMedia } = req.body;

        // 1. Validaciones estrictas de los campos obligatorios
        if (!consultorioId || !numero || !mensaje) {
            return res.status(400).json({
                ok: false,
                msg: 'Faltan parámetros requeridos: consultorioId, numero o mensaje.'
            });
        }

        const idStr = consultorioId.toString();

        // 2. Buscamos el hilo del navegador de ese consultorio en la memoria RAM
        const client = global.whatsappClients[idStr];

        if (!client) {
            return res.status(404).json({
                ok: false,
                msg: `El WhatsApp del consultorio ${idStr} no está activo o se encuentra desconectado en Render.`
            });
        }

        // 3. Formateamos el número al estándar internacional de WhatsApp (@c.us)
        // Limpiamos espacios, guiones o signos + que vengan de la base de datos
        let numeroLimpio = numero.replace(/\D/g, '');
        if (!numeroLimpio.endsWith('@c.us')) {
            numeroLimpio = `${numeroLimpio}@c.us`;
        }

        // 4. CASO A: El mensaje incluye un archivo adjunto (PDF, JPG, PNG) desde Supabase/Laravel
        if (urlMedia) {
            console.log(`📦 Descargando y empaquetando archivo multimedia: ${urlMedia}`);

            // La clase MessageMedia descarga el archivo automáticamente desde internet
            const media = await MessageMedia.fromUrl(urlMedia, { unsafeMime: true });

            // Enviamos el archivo colocando el mensaje de texto como "pie de página"
            await client.sendMessage(numeroLimpio, media, { caption: mensaje });

            return res.status(200).json({
                ok: true,
                msg: 'Mensaje multimedia (archivo + texto) enviado con éxito.'
            });
        }

        // 5. CASO B: Envío tradicional de Texto Plano (Recordatorios estándar)
        await client.sendMessage(numeroLimpio, mensaje);

        return res.status(200).json({
            ok: true,
            msg: 'Mensaje de texto enviado con éxito al paciente.'
        });

    } catch (error) {
        console.error('❌ Error crítico en enviarNotificacionPaciente:', error.message);
        return res.status(500).json({
            ok: false,
            error: error.message
        });
    }
};

// enviarNotificacionPaciente (La nueva):
// Para qué sirve: Está diseñada para enviar un solo mensaje individual e inmediato (recibe un único objeto con un solo teléfono). 
// Además, incluye el soporte para adjuntar archivos multimedia (MessageMedia) como imágenes o PDFs de recetas médicas.
// Cuándo se usa: Es ideal para acciones instantáneas que hace el médico en tiempo real desde el panel de Angular, 
// por ejemplo:Al hacer clic en "Enviar receta por WhatsApp" justo al terminar la consulta.
// Al presionar "Notificar retraso" si el médico va tarde al consultorio.
// Cuando un paciente se registra en línea y Laravel le envía un texto único de confirmación.



module.exports = {
    recibirAlertaDesdeLaravel,
    obtenerHistorialMedico,
    obtenerContadorMedico,
    marcarUnaLeidaMedica,
    borrarNotificacionMedicaPorId,
    borrarTodasLasNotificacionesMedicas,
    enviarRecordatoriosMasivos,
    enviarNotificacionPaciente
};
