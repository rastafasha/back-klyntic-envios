const Consultorio = require('../models/consultorio');
// Importamos de forma limpia las dos funciones del helper
const { crearClienteWhatsApp, enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

// 🚀 1. Arranca el proceso de conexión desde Angular
const conectarWhatsappConsultorio = async (req, res) => {
    try {
        const localId = String(req.params.id);

        // =========================================================================
        // 1. 🛡️ FILTRO DE SEGURIDAD MÁXIMO: Controlamos duplicados en RAM
        // =========================================================================
        global.whatsappClients = global.whatsappClients || {};
        global.inicializandoClientes = global.inicializandoClientes || {};
        global.whatsappStates = global.whatsappStates || {};

        if (global.whatsappClients[localId]) {
            return res.status(200).json({ _id: localId, whatsappStatus: 'CONECTADO', msg: 'El consultorio ya está activo.' });
        }

        if (global.inicializandoClientes[localId]) {
            return res.status(200).json({ _id: localId, whatsappStatus: 'INICIALIZANDO', msg: 'Instancia encendiendo Chromium. Espere el QR.' });
        }

        // Bloqueamos la RAM de inmediato para evitar que otro clic simultáneo dispare otra instancia
        global.inicializandoClientes[localId] = true;
        global.whatsappStates[localId] = {
            whatsappStatus: 'INICIALIZANDO',
            whatsappQR: ''
        };

        // =========================================================================
        // 2. 🚀 RESPUESTA INMEDIATA AL FRONTEND: Rompe el estado "Cargando" en Angular
        // =========================================================================
        // Usamos código 202 (Aceptado para procesamiento en segundo plano)
        res.status(202).json({
            _id: localId,
            whatsappStatus: 'INICIALIZANDO',
            msg: 'Iniciando el motor de WhatsApp en el microservicio en segundo plano...'
        });

        // =========================================================================
        // 3. ⏳ PROCESAMIENTO EN SEGUNDO PLANO (Post-respuesta)
        // =========================================================================
        // 🎯 CORRECCIÓN: Cambiamos a 'findOneAndUpdate' para poder usar { consultorioId: localId }
        Consultorio.findOneAndUpdate(
            { consultorioId: localId }, // 🔍 Ahora sí buscará correctamente por tu columna personalizada
            { whatsappStatus: 'INICIALIZANDO', whatsappQR: '' },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).then((docActualizado) => {
            console.log(`💾 MongoDB Atlas: Registro seteado en 'INICIALIZANDO' para ID: ${localId}`);
            // 4. Invocamos al helper de Puppeteer de forma totalmente aislada
            crearClienteWhatsApp(localId);
        }).catch(dbErr => {
            console.error(`❌ Error haciendo upsert inicial en Mongo para ${localId}:`, dbErr.message);
            // IMPORTANTE: Si la BD falló por estructura, evitamos lanzar el bot para no arrastrar basura de memoria
            global.inicializandoClientes[localId] = false; 
        });


    } catch (error) {
        console.error('❌ Error crítico en conectarWhatsappConsultorio:', error.message);
        // Validamos si por alguna razón ya se enviaron cabeceras para evitar crasheos por doble respuesta
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
    }
};



// 🔒 2. El Polling repetitivo de Angular para leer el QR
const statusWhatsappConsultorio = async (req, res) => {
    try {
        // 🚀 FORZAMOS EL ID ENTRANTE A STRING PLANO
        const idLimpio = String(req.params.id);

        global.whatsappStates = global.whatsappStates || {};

        // 1. ⚡ RESPUESTA ULTRA-RÁPIDA DESDE MEMORIA RAM
        if (global.whatsappStates[idLimpio]) {
            const estadoEnMemoria = global.whatsappStates[idLimpio];
            return res.status(200).json({
                _id: idLimpio,
                whatsappStatus: estadoEnMemoria.whatsappStatus,
                whatsappQR: estadoEnMemoria.whatsappQR
            });
        }

        // 2. 🛡️ FALLBACK DE LECTURA LIMPIA (Evita saturar Atlas con Upserts repetitivos)
        try {
            console.log(`🔍 [GET STATUS] Buscando respaldo pasivo en MongoDB para ID: ${idLimpio}...`);
            
            // Cambiamos findOneAndUpdate por findById (Lectura pura)
            const consultorio = await Consultorio.findById(idLimpio);

            // Si existe en la BD, respondemos con sus datos reales
            if (consultorio) {
                return res.status(200).json({
                    _id: idLimpio,
                    whatsappStatus: consultorio.whatsappStatus,
                    whatsappQR: consultorio.whatsappQR
                });
            }

            // Si no existe ni en RAM ni en BD, respondemos con el estado base SIN guardar nada aún
            // (El registro real se creará únicamente cuando el usuario presione "Conectar")
            return res.status(200).json({
                _id: idLimpio,
                whatsappStatus: 'DESCONECTADO',
                whatsappQR: ''
            });

        } catch (dbError) {
            console.error('❌ Error en Fallback BD del GET:', dbError.message);
            return res.status(500).json({ error: dbError.message });
        }

    } catch (error) {
        console.error('❌ Error en statusWhatsappConsultorio:', error.message);
        return res.status(500).json({ error: error.message });
    }
};



// 📡 3. Sincronización Servidor a Servidor (Cuando creas un médico en Laravel)
const sincronizarNuevoConsultorio = async (req, res) => {
    try {
        const { doctor_id } = req.body;

        // 1. Validación de seguridad previa (Debe ir ANTES de responder 200)
        if (!doctor_id) {
            return res.status(400).json({ status: 'error', message: 'ID requerido' });
        }

        // 2. 🧠 RESPUESTA INMEDIATA: Cerramos la conexión con Laravel con éxito
        res.status(200).json({ status: 'ok', message: 'Sincronización en segundo plano iniciada' });

        // =========================================================================
        // 🚀 PROCESAMIENTO EN SEGUNDO PLANO (Aislado de la respuesta HTTP)
        // =========================================================================

        // Usamos .exists() en lugar de findById para ahorrar RAM. 
        // Solo verifica si el ID ya existe en MongoDB sin traer todo el objeto a memoria.
        const existe = await Consultorio.exists({ _id: doctor_id });

        if (!existe) {
            await Consultorio.create({
                _id: doctor_id,
                whatsappStatus: 'DESCONECTADO',
                whatsappQR: '',
                whatsappConnectedAt: null
            });
            console.log(`📦 [KLYNTIC SYNC] Nuevo consultorio médico ${doctor_id} inicializado con éxito.`);
        } else {
            console.log(`ℹ [KLYNTIC SYNC] El consultorio ${doctor_id} ya existía en MongoDB. Omitiendo creación.`);
        }

    } catch (error) {
        // Al estar la respuesta 200 arriba, este catch NUNCA debe intentar responder a res.status()
        // Los errores se registran exclusivamente en la consola de Render de forma segura.
        console.error('❌ Error crítico en segundo plano sincronizando consultorio:', error.message);
    }
};


// 🔄 4. Restauración automática al encender el servidor de Render
const delay = ms => new Promise(res => setTimeout(res, ms));

const restaurarSesionesDeDoctores = async () => {
    try {
        console.log('=== 🔄 KLYNTIC: Iniciando restauración secuencial de sesiones ===');

        // Optimización de memoria: Solo traemos los _id de los consultorios activos
        const activos = await Consultorio.find({ whatsappStatus: 'CONECTADO' }).select('_id');

        console.log(`📌 Se encontraron ${activos.length} consultorios para restaurar en memoria.`);

        for (const con of activos) {
            console.log(`🤖 Levantando WhatsApp en segundo plano para Consultorio ID: ${con._id}`);

            // Inicializa la instancia del consultorio actual
            crearClienteWhatsApp(con._id);

            // =========================================================================
            // ⏳ SOLUCIÓN CRÍTICA: Espera 8 segundos antes de levantar el siguiente Chromium
            // =========================================================================
            console.log(`⏱ Dándole un respiro a la RAM de Render. Esperando 8 segundos...`);
            await delay(8000);
        }

        console.log('=== ✅ KLYNTIC: Proceso de restauración de sesiones finalizado ===');
    } catch (error) {
        console.error('❌ Error crítico restaurando sesiones en el arranque:', error.message);
    }
};


// Se ejecuta de inmediato al levantar el archivo
// restaurarSesionesDeDoctores();

module.exports = {
    conectarWhatsappConsultorio,
    statusWhatsappConsultorio,
    sincronizarNuevoConsultorio,
    restaurarSesionesDeDoctores

};
