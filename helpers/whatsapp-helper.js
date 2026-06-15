const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
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

const enviarFacturaWhatsApp = async (restauranteId, telefono, mensaje, fileBuffer, fileName) => {
    try {
        // 1. Obtener o crear el cliente del restaurante específico
        const client = crearClienteWhatsApp(restauranteId);

        // 2. Validación de seguridad: Verificar si la sesión está lista
        if (!client || !client.info) {
            console.log(`⏳ El bot del local ${restauranteId} requiere escaneo QR o está cargando.`);
            return false;
        }

        const chatId = `${telefono.replace(/\D/g, '')}@c.us`;

        // 3. Validar si el usuario existe en WhatsApp
        const existeEnWhatsApp = await client.isRegisteredUser(chatId);
        if (!existeEnWhatsApp) {
            console.log(`⚠️ El número ${telefono} no tiene WhatsApp activo.`);
            return false;
        }

        // 4. Convertir el buffer del PDF recibido de Angular a Base64 en caliente
        const media = new MessageMedia(
            'application/pdf', 
            fileBuffer.toString('base64'), 
            fileName
        );

        // 5. Enviar el texto y luego el documento PDF adjunto
        await client.sendMessage(chatId, mensaje);
        await client.sendMessage(chatId, media);
        
        console.log(`✅ Factura PDF enviada con éxito a: ${telefono} (Local: ${restauranteId})`);
        return true;
    } catch (error) {
        console.error(`❌ Error enviando Factura PDF en local ${restauranteId}:`, error.message);
        return false;
    }
};

module.exports = { crearClienteWhatsApp, enviarMensajeWhatsApp, enviarFacturaWhatsApp };
