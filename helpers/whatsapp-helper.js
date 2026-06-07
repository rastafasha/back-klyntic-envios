const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
// 💥 CORRECCIÓN CRUCIAL: Cambiamos Tienda por tu modelo médico real Consultorio
const Consultorio = require('../models/consultorio'); 

const clientesActivos = {};

const crearClienteWhatsApp = (consultorioId) => {
    // Si ya existe una conexión activa para este consultorio, la reutilizamos
    if (clientesActivos[consultorioId]) {
        return clientesActivos[consultorioId];
    }

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: consultorioId, // Agrupa la sesión bajo el ID del consultorio médico
            dataPath: './whatsapp-sessions'
        }),
        puppeteer: {
            // Configuración optimizada para los servidores Linux de Render [1]
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

        // 💥 CORRECCIÓN: Actualizamos el estado en tu colección médica de Mongo
        await Consultorio.findByIdAndUpdate(consultorioId, {
            whatsappStatus: 'ESPERANDO_QR',
            whatsappQR: qr 
        });
    });

    client.on('ready', async () => {
        console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${consultorioId}!`);

        // 💥 CORRECCIÓN: Actualizamos a conectado en tu colección médica de Mongo
        await Consultorio.findByIdAndUpdate(consultorioId, {
            whatsappStatus: 'CONECTADO',
            whatsappQR: '', 
            whatsappConnectedAt: new Date()
        });
    });

    client.initialize();

    clientesActivos[consultorioId] = client;
    return client;
};

const enviarMensajeWhatsApp = async (consultorioId, telefono, mensaje) => {
    try {
        const client = crearClienteWhatsApp(consultorioId);

        // Validación de seguridad obligatoria
        if (!client || !client.info) {
            console.log(`⏳ El bot del consultorio ${consultorioId} se está inicializando o requiere escaneo QR.`);
            return false;
        }

        const chatId = `${telefono}@c.us`;

        // Filtro de seguridad contra números sin WhatsApp (caso iPhone 5c)
        const existeEnWhatsApp = await client.isRegisteredUser(chatId);
        if (!existeEnWhatsApp) {
            console.log(`⚠️ El número ${telefono} no tiene WhatsApp activo.`);
            return false;
        }

        await client.sendMessage(chatId, mensaje);
        console.log(`✅ Mensaje médico enviado con éxito a: ${telefono} (Consultorio: ${consultorioId})`);
        return true;
    } catch (error) {
        console.error(`❌ Error enviando WhatsApp en consultorio ${consultorioId}:`, error.message);
        return false;
    }
};

module.exports = { crearClienteWhatsApp, enviarMensajeWhatsApp };
