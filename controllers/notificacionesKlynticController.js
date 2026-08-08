const { enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');
const NotificacionMedica = require('../models/notificacionMedica'); // Tu esquema médico en Mongo
const Consultorio = require('../models/consultorio');

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

            // 🚀 MEJORA ABSOLUTA: Validamos el estado real al instante desde la memoria RAM global
            const estadoEnMemoria = global.whatsappStates && global.whatsappStates[idDoctorStr];
            const clienteActivo = global.whatsappClients && global.whatsappClients[idDoctorStr];

            if (estadoEnMemoria && estadoEnMemoria.whatsappStatus === 'CONECTADO' && clienteActivo) {

                // Formateo rápido anti-errores antes de enviar
                let telefonoLimpio = telefono.replace(/\D/g, '');
                if (telefonoLimpio.startsWith('0')) {
                    telefonoLimpio = '58' + telefonoLimpio.substring(1);
                }

                // 🚀 DISPARO REAL DESDE LA INSTANCIA DE MEMORIA
                const enviado = await enviarMensajeWhatsApp(idDoctorStr, telefonoLimpio, mensaje);

                if (enviado) {
                    console.log(`[ÉXITO] Recordatorio enviado al paciente ${telefonoLimpio} desde el canal del Doctor ID: ${idDoctorStr}`);
                } else {
                    console.log(`[FALLO] No se pudo entregar el mensaje al número ${telefonoLimpio}.`);
                }

            } else {
                console.log(`[IGNORADO] El consultorio ${idDoctorStr} está DESCONECTADO en RAM. No se envía a ${telefono}.`);
            }

            // ⏳ Mantenemos tu excelente pausa protectora anti-spam
            console.log(`⏱ Esperando 3.5 segundos antes del siguiente recordatorio...`);
            await delay(3500);
        }


    } catch (error) {
        // Como ya respondimos 200 a Laravel, los errores se quedan exclusivamente en tu consola local
        console.error('❌ Error crítico en el bulk de notificaciones Klyntic:', error);
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
};
