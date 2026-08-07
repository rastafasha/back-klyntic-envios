const Consultorio = require('../models/consultorio');
// Importamos de forma limpia las dos funciones del helper
const { crearClienteWhatsApp, enviarMensajeWhatsApp } = require('../helpers/whatsapp-helper');

// 🚀 1. Arranca el proceso de conexión desde Angular
const conectarWhatsappConsultorio = async (req, res) => {
    try {
        const localId = String(req.params.id);
        const consultorio = await Consultorio.findById(localId);
        if (!consultorio) {
            return res.status(404).json({ error: 'El consultorio no existe.' });
        }

        // =========================================================================
        // 1. 🛡️ FILTRO DE SEGURIDAD MÁXIMO: Primero revisamos si ya hay algo corriendo
        // =========================================================================
        global.whatsappClients = global.whatsappClients || {};
        global.inicializandoClientes = global.inicializandoClientes || {};
        global.whatsappStates = global.whatsappStates || {};

        // CASO A: Si el cliente ya está guardado en el objeto activo global
        if (global.whatsappClients[localId]) {
            return res.status(200).json({ 
                _id: localId, 
                whatsappStatus: 'CONECTADO', 
                msg: 'El consultorio ya se encuentra vinculado y activo en memoria.' 
            });
        }

        // CASO B: Si ya está encendiendo de verdad (Freno al doble clic rápido)
        if (global.inicializandoClientes[localId]) {
            return res.status(200).json({ 
                _id: localId, 
                whatsappStatus: 'INICIALIZANDO', 
                msg: 'Ya hay una instancia encendiendo el navegador. Por favor, espere el código QR.' 
            });
        }

        // CASO C: Si ya está esperando escaneo (Por si Angular perdió la conexión por un microcorte)
        if (global.whatsappStates[localId] && global.whatsappStates[localId].whatsappStatus === 'ESPERANDO_QR') {
            return res.status(200).json({ 
                _id: localId, 
                whatsappStatus: 'ESPERANDO_QR', 
                whatsappQR: global.whatsappStates[localId].whatsappQR,
                msg: 'Ya hay una instancia generando el código QR activo, utilícelo.' 
            });
        }

        // =========================================================================
        // 2. 🚀 PASÓ LOS FILTROS: Ahora sí inicializamos la memoria de forma segura
        // =========================================================================
        global.whatsappStates[localId] = {
            whatsappStatus: 'INICIALIZANDO',
            whatsappQR: ''
        };

        await Consultorio.findByIdAndUpdate(localId, { 
            whatsappStatus: 'INICIALIZANDO', 
            whatsappQR: '' 
        });

        // 3. Invocamos al helper en segundo plano (abrirá Chromium de forma asíncrona)
        crearClienteWhatsApp(localId);

        // 4. Respondemos al botón de Angular indicando el encendido real
        return res.status(200).json({ 
            _id: localId, 
            whatsappStatus: 'INICIALIZANDO', 
            msg: 'Iniciando el motor de WhatsApp. Encendiendo navegador Chromium...' 
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

        // 🚀 LOG DE INSPECCIÓN MASIVA: Ver exactamente qué hay guardado en la RAM
        console.log('--- 🧠 EXAMEN DE MEMORIA RAM GLOBALES ---');
        console.log('Contenido de whatsappStates:', JSON.stringify(global.whatsappStates));
        console.log('Llaves activas en whatsappStates:', Object.keys(global.whatsappStates || {}));
        console.log('-----------------------------------------');


        console.log(`🔍 [GET STATUS] Evaluando ID: ${idLimpio} en la memoria RAM...`);
        // 1. Revisamos la memoria RAM del servidor usando el String limpio
        if (global.whatsappStates && global.whatsappStates[idLimpio]) {
            const estadoEnMemoria = global.whatsappStates[idLimpio];

            console.log(`🧠 [GET STATUS] ¡ÉXITO! Encontrado en RAM para ID ${idLimpio}: ${estadoEnMemoria.whatsappStatus}`);

            return res.status(200).json({
                _id: idLimpio,
                whatsappStatus: estadoEnMemoria.whatsappStatus,
                whatsappQR: estadoEnMemoria.whatsappQR
            });
        }

        // 2. Fallback: Si de verdad no está inicializado en RAM, buscamos en MongoDB
        console.log(`📦 [GET STATUS] ID ${idLimpio} no está en RAM. Buscando en MongoDB...`);
        const consultorio = await Consultorio.findById(idLimpio);

        if (!consultorio) {
            return res.status(404).json({ error: 'El consultorio no existe.' });
        }

        return res.status(200).json({
            _id: idLimpio,
            whatsappStatus: consultorio.whatsappStatus || 'DESCONECTADO',
            whatsappQR: consultorio.whatsappQR || ''
        });

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
