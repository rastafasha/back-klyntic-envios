const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Convertidor a Base64 para Angular
const Consultorio = require('../models/consultorio'); 

// Registramos el contenedor en el espacio global de la RAM
global.whatsappClients = global.whatsappClients || {};

const crearClienteWhatsApp = (consultorioId) => {
    if (global.whatsappClients[consultorioId]) {
        return global.whatsappClients[consultorioId];
    }

    console.log(`🤖 Inicializando instancia de WhatsApp para Consultorio ID: ${consultorioId}`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `consultorio_${consultorioId}`, 
            dataPath: './.wwebjs_auth' // Carpeta oculta para que GitHub la ignore
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process' 
            ],
        }
    });

    client.on('qr', async (qr) => {
        console.log(`✨ QR generado para el consultorio: ${consultorioId}`);
        try {
            // Convertimos el texto del QR a imagen Base64 para tu Angular
            const qrBase64 = await qrcode.toDataURL(qr);
            await Consultorio.findByIdAndUpdate(consultorioId, {
                whatsappStatus: 'ESPERANDO_QR',
                whatsappQR: qrBase64 
            });
        } catch (err) {
            console.error('Error procesando QR en helper:', err);
        }
    });

    client.on('ready', async () => {
        console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${consultorioId}!`);
        await Consultorio.findByIdAndUpdate(consultorioId, {
            whatsappStatus: 'CONECTADO',
            whatsappQR: '', 
            whatsappConnectedAt: new Date()
        });
    });

    client.on('disconnected', async (reason) => {
        console.log(`❌ WhatsApp desconectado en consultorio ${consultorioId}. Razón: ${reason}`);
        await Consultorio.findByIdAndUpdate(consultorioId, {
            whatsappStatus: 'DESCONECTADO',
            whatsappQR: '',
            whatsappConnectedAt: null
        });
        delete global.whatsappClients[consultorioId];
    });

    client.initialize().catch(err => console.error('Error init cliente:', err));

    global.whatsappClients[consultorioId] = client;
    return client;
};

const enviarMensajeWhatsApp = async (consultorioId, telefono, mensaje) => {
    try {
        const client = global.whatsappClients[consultorioId];

        // Si la sesión no está cargada en memoria, intentamos levantarla
        if (!client) {
            console.log(`⏳ Levantando cliente en memoria para el consultorio ${consultorioId}`);
            crearClienteWhatsApp(consultorioId);
            return false;
        }

        // Validación de seguridad para asegurar que el bot está activo
        if (!client.info) {
            console.log(`⏳ El bot del consultorio ${consultorioId} requiere escaneo QR.`);
            return false;
        }

        const chatId = `${telefono}@c.us`;

        // Filtro de seguridad (Caso iPhone 5c)
        const existeEnWhatsApp = await client.isRegisteredUser(chatId);
        if (!existeEnWhatsApp) {
            console.log(`⚠️ El número ${telefono} no tiene WhatsApp activo.`);
            return false;
        }

        await client.sendMessage(chatId, mensaje);
        console.log(`✅ Mensaje médico enviado con éxito a: ${telefono}`);
        return true;
    } catch (error) {
        console.error(`❌ Error enviando WhatsApp en consultorio ${consultorioId}:`, error.message);
        return false;
    }
};

module.exports = { crearClienteWhatsApp, enviarMensajeWhatsApp };
