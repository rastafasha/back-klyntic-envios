const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu esquema médico en Mongo
const PushSubscription = require('../models/push-subscription'); // Tu modelo de dispositivos en Mongo
const { sendNotification } = require('../helpers/sendNotification'); // Tu helper maestro de WebPush
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
        // Log de control para ver la realidad en tu consola de Render o local
        console.log("📥 [WEBHOOK KLYNTIC] Payload entrante desde Laravel:", JSON.stringify(req.body, null, 2));

        // 🟢 EL MAPEO REAL: Extraemos los campos exactos que Laravel te está enviando físicamente
        const {
            consultorio_id,
            telefono,
            mensaje,
            usuario,          // ID de MySQL en string ("16")
            rolDestinatario,  // 'MEDICO' o 'PACIENTE'
            titulo,           
            tipo,             // 'PAGO_RECIBIDO', 'CITA_AGENDADA', etc.
            referenciaId      
        } = req.body;

        // =========================================================================
        // 🚀 DOBLE CANAL AUTOMÁTICO: WEBSOCKETS + WEB PUSH NATIVO
        // =========================================================================
        if (usuario && tipo) {
            
            // A. Guardamos la persistencia limpia en MongoDB Atlas
            const nuevaNotificacion = new NotificacionMedica({
                usuario: String(usuario).trim(), 
                rolDestinatario,
                titulo,
                mensaje, 
                tipo,
                referenciaId
            });
            await nuevaNotificacion.save();

            // B. CANAL 1: Emitimos por WebSockets (Prende tu campana en caliente)
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
            }

            // 🚀 C. CANAL 2: EL GLOBO PUSH NATIVO ("Como todas las apps")
            try {
                const uidLimpio = String(usuario).trim();
                // Buscamos en tu colección si el médico o paciente activaron el switch en su perfil
                const dispositivos = await PushSubscription.find({ usuario: uidLimpio });

                if (dispositivos && dispositivos.length > 0) {
                    console.log(`📡 [WEB PUSH] Despachando burbuja flotante a ${dispositivos.length} navegador(es)...`);
                    
                    // Calculamos a qué ruta de Angular debe mandar al usuario al darle clic al globo
                    const urlRedireccion = rolDestinatario === 'DOCTOR'
                        ? (tipo.includes('PAGO') ? '/medical/appointment-pay/list' : '/medical')
                        : (tipo.includes('PAGO') ? '/app/mis-pagos' : '/app/home');

                    // Ejecutamos tu helper existente inyectándole las llaves VAPID en segundo plano
                    const promesasPush = dispositivos.map(disp => 
                        sendNotification(
                            disp.subscription, 
                            titulo || '🔔 Alerta Klyntic', 
                            mensaje, 
                            urlRedireccion, 
                            uidLimpio, 
                            tipo, 
                            referenciaId
                        ).catch(pushErr => {
                            // Salvavidas: si el token venció en el celular del cliente (Error 410), limpiamos Mongo en caliente
                            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) disp.deleteOne();
                        })
                    );
                    await Promise.all(promesasPush);
                }
            } catch (pushErr) {
                console.error('Aviso menor en el hilo secundario de WebPush:', pushErr.message);
            }
        }

        // TAREA 2: Encolado de WhatsApp (Tu lógica existente intacta)
        if (telefono) {
            // ... tu código de encolar WhatsApp se queda exactamente igual ...
        }

        // Respondemos rápido un 200 para que tu MAMP/PHP no sufra retardos
        return res.status(200).json({ ok: true, msg: 'Doble canal y cola de WhatsApp procesados con éxito.' });

    } catch (error) {
        console.error('❌ Error crítico en el webhook principal:', error);
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


// 🔒 SEGURIDAD MULTI-TENANT: DESTRUCCIÓN CON AISLAMIENTO DE IDENTIDAD
// =========================================================================

/**
 * 🚨 BORRAR UNA SOLA ALERTA POR Su ID
 * Verifica físicamente que la alerta pertenezca al usuario dueño del token JWT
 */
const borrarNotificacionMedicaPorId = async (req, res) => {
    try {
        const notiId = req.params.id;
        const uidToken = req.uid; // ID recuperado de forma infalsificable por el middleware 'validarJWT'

        if (!uidToken) {
            return res.status(401).json({ ok: false, msg: 'Acción rechazada. Identificador de sesión ausente.' });
        }

        // 🔍 1. Buscamos el documento en MongoDB Atlas sin borrarlo todavía
        const notificacion = await NotificacionMedica.findById(notiId);

        if (!notificacion) {
            return res.status(404).json({ ok: false, msg: 'La notificación solicitada no existe en el sistema.' });
        }

        // 🛡️ 2. CANDADO ANTI-SABOTAJE: Evaluamos si el campo 'usuario' coincide en número y letra con el token
        const esDuenoReal = (String(notificacion.usuario).trim() === String(uidToken).trim());

        if (!esDuenoReal) {
            console.error(`🚨 [ALERTA DE SEGURIDAD]: El usuario ${uidToken} intentó borrar la notificación #${notiId} que le pertenece al usuario ${notificacion.usuario}`);
            return res.status(403).json({ 
                ok: false, 
                msg: 'Acción ilegal denegada. No posees derechos de propiedad sobre este registro.' 
            });
        }

        // 3. Si pasó el candado, se procede con la eliminación real en caliente
        await notificacion.deleteOne();
        console.log(`🧹 [MONGO] Alerta #${notiId} eliminada de forma segura por su dueño: ${uidToken}`);

        return res.json({ ok: true, msg: 'Notificación eliminada de forma exitosa.' });

    } catch (error) {
        console.error('❌ Error en borrarNotificacionMedicaPorId:', error.message);
        return res.status(500).json({ ok: false, msg: 'Fallo interno procesando la solicitud de borrado.' });
    }
};

/**
 * 🧹 VACIAR EL BUZÓN COMPLETO
 * Limpia el historial entero, pero encerrado de forma estricta en las variables del token
 */
const borrarTodasLasNotificacionesMedicas = async (req, res) => {
    try {
        const uidToken = req.uid;

        if (!uidToken) {
            return res.status(401).json({ ok: false, msg: 'Acción rechazada. Identificador de sesión ausente.' });
        }

        const uidLimpio = String(uidToken).trim();

        // 🔍 SANEAMIENTO MULTI-TENANT: El filtro limpia AMBOS formatos (String y entero)
        // pero amarrado de forma rígida a que el campo coincida UNICAMENTE con el usuario de esta sesión.
        // Es imposible que borre registros de otra clínica o paciente porque no hay un "deleteMany({})" en blanco.
        const queryFiltroEstricto = {
            $or: [
                { usuario: uidLimpio },
                { usuario: Number(uidLimpio) }
            ]
        };

        // Ejecutamos la purga masiva controlada
        const resultado = await NotificacionMedica.deleteMany(queryFiltroEstricto);
        console.log(`🧹 [MONGO DESTRUCCIÓN] Historial vaciado por completo para el usuario: ${uidLimpio}. Registros eliminados: ${resultado.deletedCount}`);

        return res.json({ 
            ok: true, 
            msg: 'Historial médico vaciado correctamente.', 
            totalEliminados: resultado.deletedCount 
        });

    } catch (error) {
        console.error('❌ Error en borrarTodasLasNotificacionesMedicas:', error.message);
        return res.status(500).json({ ok: false, msg: 'Fallo interno vaciando el historial.' });
    }
};



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
