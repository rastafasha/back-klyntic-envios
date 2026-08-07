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

        // =========================================================================
        // 2. 🚀 UPSERT EN MONGO: Seteamos 'INICIALIZANDO' creando el registro si es nuevo
        // =========================================================================
        global.whatsappStates[localId] = {
            whatsappStatus: 'INICIALIZANDO',
            whatsappQR: ''
        };

        // { upsert: true } es la clave: si no existe el ID de MySQL en Mongo, lo crea en este instante
        await Consultorio.findByIdAndUpdate(
            localId,
            { whatsappStatus: 'INICIALIZANDO', whatsappQR: '' },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // 3. Invocamos al helper de Puppeteer en segundo plano
        crearClienteWhatsApp(localId);

        return res.status(200).json({
            _id: localId,
            whatsappStatus: 'INICIALIZANDO',
            msg: 'Iniciando el motor de WhatsApp en el microservicio...'
        });

    } catch (error) {
        console.error('❌ Error en conectarWhatsappConsultorio:', error.message);
        return res.status(500).json({ error: error.message });
    }
};


// 🔒 2. El Polling repetitivo de Angular para leer el QR
const statusWhatsappConsultorio = async (req, res) => {
    try {
        // 🚀 FORZAMOS EL ID ENTRANTE A STRING PLANO
        const idLimpio = String(req.params.id);

        global.whatsappStates = global.whatsappStates || {};

        console.log(`🔍 [GET STATUS] Evaluando ID: ${idLimpio} en la memoria RAM...`);
        // 1. Revisamos la memoria RAM del servidor
        if (global.whatsappStates[idLimpio]) {
            const estadoEnMemoria = global.whatsappStates[idLimpio];
            return res.status(200).json({
                _id: idLimpio,
                whatsappStatus: estadoEnMemoria.whatsappStatus,
                whatsappQR: estadoEnMemoria.whatsappQR
            });
        }

        // 2. Fallback: Si no está en RAM, buscamos en MongoDB haciendo un Upsert pasivo
        try {
            // Si el médico es nuevo en el ecosistema, le creamos su estado base en Mongo
            const consultorio = await Consultorio.findOneAndUpdate(
                { _id: idLimpio },
                { $setOnInsert: { whatsappStatus: 'DESCONECTADO', whatsappQR: '' } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            return res.status(200).json({
                _id: idLimpio,
                whatsappStatus: consultorio.whatsappStatus,
                whatsappQR: consultorio.whatsappQR
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
