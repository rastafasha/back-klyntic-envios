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
        // 🔥 LOG DE DETECCIÓN: Imprime en tu terminal de Node exactamente qué te mandó Laravel
        console.log("📥 [WEBHOOK RECEPCIÓN] Payload recibido desde Laravel:", JSON.stringify(req.body, null, 2));

        const {
            consultorio_id,
            telefono,
            mensaje,
            usuario,          // ID de MySQL
            rolDestinatario,  // 'MEDICO' o 'PACIENTE'
            titulo,           
            tipo,             // El enum
            referenciaId      
        } = req.body;

        // =========================================================================
        // 🚀 TAREA 1: Notificación Interna en la App (MongoDB + WebSockets)
        // =========================================================================
        // Si entra aquí, imprimirá un log. Si no entra, sabremos que usuario o tipo vienen nulos.
        if (usuario && tipo) {
            console.log(`💾 Intentando guardar en Mongo para usuario: ${usuario}, Tipo: ${tipo}`);
            
            const nuevaNotificacion = new NotificacionMedica({
                usuario: String(usuario).trim(), 
                rolDestinatario,
                titulo,
                mensaje, 
                tipo,
                referenciaId
            });
            
            await nuevaNotificacion.save()
                .then(() => console.log("✅ [MONGO] Alerta guardada con éxito en la base de datos."))
                .catch(err => console.error("❌ [MONGO ERROR] El esquema rechazó el guardado:", err.message));

            const socketServer = req.io || global.io;
            if (socketServer) {
                const unreadCount = await NotificacionMedica.countDocuments({ 
                    usuario: String(usuario).trim(), 
                    leido: false 
                });

                socketServer.emit(`notificacion-usuario-${usuario}`, {
                    notificacion: nuevaNotificacion,
                    unreadCount: unreadCount 
                });

                socketServer.to(String(usuario)).emit('recibir-alerta', {
                    notificacion: nuevaNotificacion,
                    unreadCount: unreadCount
                });
            }
        } else {
            // 🔥 ADVERTENCIA: Te avisará en la consola si las variables críticas llegaron vacías
            console.warn("⚠️ [WEBHOOK ABORTADO]: No se guardó en Mongo porque 'usuario' o 'tipo' vinieron vacíos en el JSON.");
        }


       // =========================================================================
        // 💬 TAREA 2: Encolado de WhatsApp Seguro con Despertar Automático (MAMP)
        // =========================================================================
        if (telefono) {
            let telefonoLimpio = telefono.replace(/\D/g, '');
            if (telefonoLimpio.startsWith('0')) {
                telefonoLimpio = '58' + telefonoLimpio.substring(1);
            }

            const NotificacionCola = require('../models/notificacionCola');

            // Guardamos en la base de datos de persistencia
            await NotificacionCola.findOneAndUpdate(
                { referenciaId: String(referenciaId) }, 
                {
                    consultorio_id: String(consultorio_id),
                    telefono: telefonoLimpio,
                    mensaje: mensaje,
                    estado: 'PENDIENTE', 
                    intentos: 0
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).catch(err => console.error('❌ Error al guardar en cola de WhatsApp:', err.message));

            // ⚡ MOTOR VIVO: Despertamos el bucle de procesamiento si está dormido
            if (!procesandoCola) {
                procesarColaWhatsAppEnSegundoPlano();
            }
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

const procesarColaWhatsAppEnSegundoPlano = async () => {
    procesandoCola = true;
    const NotificacionCola = require('../models/notificacionCola');

    try {
        console.log('⏱️ [Klyntic Queue] Buscando mensajes PENDIENTES en MongoDB...');
        let mensajePendiente = await NotificacionCola.findOne({ estado: 'PENDIENTE' });

        while (mensajePendiente) {
            const idDoctorStr = String(mensajePendiente.consultorio_id);
            let clienteActivo = global.whatsappClients && global.whatsappClients[idDoctorStr];

            if (clienteActivo) {
                let destino = mensajePendiente.telefono;
                if (!destino.endsWith('@c.us')) destino = `${destino}@c.us`;

                try {
                    await clienteActivo.sendMessage(destino, mensajePendiente.mensaje);
                    mensajePendiente.estado = 'ENVIADO';
                    console.log(`✅ Message delivered directly to: ${destino}`);
                } catch (err) {
                    mensajePendiente.intentos += 1;
                    if (mensajePendiente.intentos >= 3) mensajePendiente.estado = 'FALLIDO';
                    console.error(`❌ Native Error sending to ${destino}:`, err.message);
                }
                await mensajePendiente.save();
            } else {
                console.warn(`⚠️ Consultorio ${idDoctorStr} desconectado. Se pospone el mensaje.`);
                // Cambiamos el estado temporalmente para no atorar el bucle infinito
                mensajePendiente.estado = 'ESPERANDO_CONEXION';
                await mensajePermanente.save();
            }

            // Pausa protectora de 3.5 segundos para evitar bloqueos/spam
            await delay(3500);
            // Buscamos el siguiente registro pendiente
            mensajePendiente = await NotificacionCola.findOne({ estado: 'PENDIENTE' });
        }
    } catch (error) {
        console.error('❌ Error crítico procesando la cola de WhatsApp:', error);
    } finally {
        procesandoCola = false;
        console.log('🏁 [Klyntic Queue] Cola vaciada o en espera de nuevas alertas.');
    }
};

// =========================================================================
// 🔔 HISTORIAL Y INTERFAZ DE ANGULAR (MÉDICOS / PACIENTES)
// =========================================================================
const obtenerHistorialMedico = async (req, res) => {
    try {
        const usuarioId = req.params.id || req.uid;

        if (!usuarioId) {
            return res.status(400).json({ ok: false, msg: 'No se proporcionó el ID del usuario' });
        }

        const pagina = parseInt(req.query.page, 10) || 1;
        const limitePorPagina = 10;
        const saltarRegistros = (pagina - 1) * limitePorPagina;

        // 🟢 CLAVE DEL SANEAMIENTO: Buscamos el ID tanto en String como en Número entero
        // Esto soluciona de inmediato el problema si Laravel guardó "16" o 16.
        const queryFiltro = {
            $or: [
                { usuario: String(usuarioId).trim() },
                { usuario: Number(usuarioId) }
            ]
        };

        // Ejecutamos las consultas con el nuevo filtro unificado
        const [notificaciones, totalNotificaciones] = await Promise.all([
            NotificacionMedica.find(queryFiltro)
                .sort({ fecha: -1 })
                .skip(saltarRegistros)
                .limit(limitePorPagina),
            NotificacionMedica.countDocuments(queryFiltro)
        ]);

        const totalPaginas = Math.ceil(totalNotificaciones / limitePorPagina);
        const proximo = pagina < totalPaginas ? pagina + 1 : null;

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

        // 🧠 RESPUESTA INMEDIATA: Cerramos la conexión con Laravel en milisegundos para evitar Timeouts
        res.status(200).json({ status: 'ok', message: 'Procesando lote de notificaciones en Klyntic...' });

        console.log(`=== 📦 KLYNTIC BULK: Procesando lote de ${recordatorios.length} recordatorios ===`);

        // Limpiamos la URL de Laravel para el reporte posterior
        const urlBase = process.env.LARAVEL_API_URL;
        const urlBaseLimpia = urlBase.endsWith('/') ? urlBase.slice(0, -1) : urlBase;

        // Procesamos la ráfaga de mensajes en segundo plano dentro de Node.js
        for (const item of recordatorios) {
            // Nota: Asegúrate de que Laravel te envíe el 'id' de la cita en cada item del lote
            const { id, doctor_id, telefono, mensaje } = item; 
            const idDoctorStr = String(doctor_id);

            let clienteActivo = global.whatsappClients && global.whatsappClients[idDoctorStr];
            let estadoEnMemoria = global.whatsappStates && global.whatsappStates[idDoctorStr];

            // =========================================================================
            // 🚀 AUTO-DESPERTAR CLOUD INTELIGENTE
            // =========================================================================
            if (!clienteActivo) {
                console.log(`🔍 [BULK AUTO-REVIVE] Consultorio ${idDoctorStr} no está en RAM. Buscando en MongoDB Atlas...`);

                const consultorioDB = await Consultorio.findById(idDoctorStr);

                if (consultorioDB && consultorioDB.whatsappStatus === 'CONECTADO') {
                    console.log(`🤖 [BULK AUTO-REVIVE] Sesión activa en Atlas. Levantando Puppeteer de forma segura...`);

                    crearClienteWhatsApp(idDoctorStr);

                    console.log(`⏳ Esperando la sincronización de Puppeteer en el entorno de Render...`);

                    await new Promise((resolve) => {
                        let intentosMaximos = 12; 
                        let contador = 0;

                        const verificarEstado = setInterval(() => {
                            contador++;

                            const clienteListo = global.whatsappClients && global.whatsappClients[idDoctorStr];
                            const estadoListo = global.whatsappStates && global.whatsappStates[idDoctorStr]?.whatsappStatus === 'CONECTADO';

                            if (clienteListo && estadoListo) {
                                console.log(`✅ [BULK AUTO-REVIVE] ¡Instancia operativa y en estado READY en el segundo ${contador * 5}!`);
                                clearInterval(verificarEstado);
                                resolve(true); 
                            } else if (contador >= intentosMaximos) {
                                console.log(`❌ [BULK AUTO-REVIVE] Tiempo de espera límite alcanzado (60s). Chromium no respondió.`);
                                clearInterval(verificarEstado);
                                resolve(false); 
                            } else {
                                const estadoActual = global.whatsappStates && global.whatsappStates[idDoctorStr]?.whatsappStatus;
                                console.log(`⏳ [${contador}/12] Puppeteer se encuentra en estado: [${estadoActual || 'DESCONOCIDO'}] (${contador * 5}s)...`);
                            }
                        }, 5000); 
                    });

                    clienteActivo = global.whatsappClients[idDoctorStr];
                    estadoEnMemoria = global.whatsappStates[idDoctorStr];
                }
            }

            // =========================================================================
            // ⚡ DISPARO SEGURO CON LA INSTANCIA YA RECUPERADA Y REPORTE A LARAVEL
            // =========================================================================
            if (clienteActivo) {
                let telefonoLimpio = telefono.replace(/\D/g, '');
                if (telefonoLimpio.startsWith('0')) {
                    telefonoLimpio = '58' + telefonoLimpio.substring(1);
                }
                if (!telefonoLimpio.endsWith('@c.us')) {
                    telefonoLimpio = `${telefonoLimpio}@c.us`;
                }

                try {
                    // 1. Disparo real directo a la instancia de Puppeteer
                    await clienteActivo.sendMessage(telefonoLimpio, mensaje);
                    console.log(`[ÉXITO] Recordatorio enviado al paciente ${telefonoLimpio} desde el canal del Doctor ID: ${idDoctorStr}`);

                    // 2. Reportamos de vuelta a Laravel que la cita se notificó (Solo si Laravel mandó el ID de la cita)
                    if (id) {
                        const urlUpdate = `${urlBaseLimpia}/api/appointments/update-cron-state/${id}`;
                        await axios.post(urlUpdate, {}, {
                            headers: { 'Authorization': `Bearer ${process.env.WEBHOOK_SECRET_TOKEN}` }
                        });
                        console.log(`🔄 Estado de cita ID ${id} actualizado en Laravel.`);
                    }

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

        console.log(`=== 🏁 KLYNTIC BULK: Finalizado el procesamiento de todo el lote ===`);

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
