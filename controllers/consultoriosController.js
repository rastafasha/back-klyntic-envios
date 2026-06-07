const { crearClienteWhatsApp } = require('../helpers/whatsapp-helper');
const Consultorio = require('../models/consultorio'); // Tu modelo médico en Mongo
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Para convertir el código a Base64 listo para Angular

// Creamos un objeto global en memoria para almacenar las instancias activas de los doctores
// Esto evita que las sesiones se dupliquen si el doctor vuelve a hacer clic en conectar
global.whatsappClients = global.whatsappClients || {};

const conectarWhatsappConsultorio = async (req, res) => {
    try {
        const localId = req.params.id; // ID numérico de MySQL que actúa como _id en Mongo

        // 1. Buscamos y actualizamos el estado inicial en MongoDB para este consultorio
        // Usamos { new: true } para que devuelva el documento actualizado si lo necesitas
        await Consultorio.findByIdAndUpdate(localId, {
            whatsappStatus: 'ESPERANDO_QR',
            whatsappQR: '' // Limpiamos QR viejos antes de generar el nuevo
        });

        // 2. Arrancamos el proceso dinámico multitenant que ya tenías de restaurantes
        crearClienteWhatsApp(localId);

        // 3. Forzamos el retorno inmediato para activar el bucle de Angular
        return res.status(200).json({
            _id: localId,
            whatsappStatus: 'ESPERANDO_QR',
            whatsappQR: ''
        });

    } catch (error) {
        console.error('Error al conectar WhatsApp del consultorio:', error);
        return res.status(500).json({ error: error.message });
    }
};


const statusWhatsappConsultorio = async (req, res) => {
    try {
        const consultorio = await Consultorio.findById(req.params.id).select('whatsappStatus whatsappQR');
        return res.status(200).json(consultorio);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};



const sincronizarNuevoConsultorio = async (req, res) => {
    try {
        const { doctor_id } = req.body;

        if (!doctor_id) {
            return res.status(400).json({ status: 'error', message: 'ID del doctor requerido' });
        }

        // Enviamos respuesta rápida a Laravel para liberar tu Shared Hosting
        res.status(200).json({ status: 'ok', message: 'Consultorio recibido' });

        // Verificamos si ya existe por si acaso (Evita duplicados)
        const existe = await Consultorio.findById(doctor_id);

        if (!existe) {
            // Creamos el documento inicial usando el ID de MySQL como _id principal
            await Consultorio.create({
                _id: doctor_id, // "45"
                whatsappStatus: 'DESCONECTADO',
                whatsappQR: '',
                whatsappConnectedAt: null
            });
            console.log(`Consultorio médico ${doctor_id} inicializado con éxito en MongoDB.`);
        }

    } catch (error) {
        console.error('Error al sincronizar consultorio en Node:', error);
    }
};

// 2. EL MOTOR MULTITENANT (Función interna del servidor, no lleva req ni res)

const crearClienteWhatsApp = async (localId) => {
    // 1. Si el médico ya tiene un cliente inicializado en memoria, lo cerramos antes de crear uno nuevo
    if (global.whatsappClients[localId]) {
        try {
            await global.whatsappClients[localId].destroy();
        } catch (e) {
            console.log(`Instancia previa de ${localId} ya estaba cerrada.`);
        }
    }

    console.log(`Iniciando sesión de WhatsApp para el Consultorio ID: ${localId}`);

    // 2. Inicializamos el cliente de WhatsApp aislado por carpetas usando LocalAuth
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `consultorio_${localId}`, // Guarda la sesión en: .wwebjs_auth/session-consultorio_45
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            // Argumentos obligatorios para que corra ligero y sin colgarse en servidores Linux/Render
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        }
    });

    // 📥 EVENTO 1: Generación del Código QR
    client.on('qr', async (qr) => {
        console.log(`[QR GENERADO] para Consultorio ${localId}`);
        try {
            // Convertimos el texto del QR a una imagen Base64 para que Angular la pinte directo en un <img src="...">
            const qrBase64 = await qrcode.toDataURL(qr);
            
            // Actualizamos MongoDB para que el Polling de Angular lo detecte
            await Consultorio.findByIdAndUpdate(localId, {
                whatsappStatus: 'ESPERANDO_QR',
                whatsappQR: qrBase64
            });
        } catch (err) {
            console.error('Error al guardar el QR en Mongo:', err);
        }
    });

    // ✅ EVENTO 2: Autenticación Exitosa (Escaneo Correcto)
    client.on('ready', async () => {
        console.log(`[WHATSAPP CONECTADO] El Consultorio ${localId} está listo.`);
        try {
            await Consultorio.findByIdAndUpdate(localId, {
                whatsappStatus: 'CONECTADO',
                whatsappQR: '', // Limpiamos el QR porque ya no se necesita
                whatsappConnectedAt: new Date()
            });
        } catch (err) {
            console.error('Error al actualizar estado READY en Mongo:', err);
        }
    });

    // ❌ EVENTO 3: Desconexión o Cierre de Sesión desde el Teléfono
    client.on('disconnected', async (reason) => {
        console.log(`[DESCONECTADO] El Consultorio ${localId} cerró sesión. Razón: ${reason}`);
        try {
            await Consultorio.findByIdAndUpdate(localId, {
                whatsappStatus: 'DESCONECTADO',
                whatsappQR: '',
                whatsappConnectedAt: null
            });
            
            // Limpiamos la memoria global del servidor
            delete global.whatsappClients[localId];
        } catch (err) {
            console.error('Error al actualizar desconexión en Mongo:', err);
        }
    });

    // Lanzamos Puppeteer en segundo plano
    client.initialize().catch(err => {
        console.error(`Error inicializando cliente de consultorio ${localId}:`, err);
    });

    // Guardamos la instancia en nuestro objeto global indexado por el ID del médico
    global.whatsappClients[localId] = client;
};

const restaurarSesionesDeDoctores = async () => {
    try {
        console.log('=== 🔄 KLYNTIC: Buscando sesiones de WhatsApp por restaurar ===');
        
        // Buscamos en MongoDB todos los consultorios que tenían el estado 'CONECTADO'
        const consultoriosActivos = await Consultorio.find({ whatsappStatus: 'CONECTADO' });

        for (const con of consultoriosActivos) {
            console.log(`Restaurando conexión automática para el Doctor ID: ${con._id}`);
            // Invocamos tu motor interno. Como LocalAuth guardó los archivos en disco,
            // se conectará de inmediato SIN pedir código QR nuevo.
            crearClienteWhatsApp(con._id);
        }
    } catch (error) {
        console.error('Error en la restauración automática de sesiones:', error);
    }
};

// Ejecutamos la función inmediatamente al cargar el archivo
restaurarSesionesDeDoctores();



module.exports = {
    conectarWhatsappConsultorio,
    statusWhatsappConsultorio,
    sincronizarNuevoConsultorio
};
