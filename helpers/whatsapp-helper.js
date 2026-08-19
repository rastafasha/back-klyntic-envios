// const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');//modo pago para guardar RemoteAuth
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo'); // 🚀 CORRECCIÓN 1: Importación obligatoria
const Consultorio = require('../models/consultorio');
const QRCode = require('qrcode');
const mongoose = require('mongoose');

global.whatsappClients = global.whatsappClients || {};
global.inicializandoClientes = global.inicializandoClientes || {};
// NUEVO: Objeto global volátil para estados y QR rápidos sin saturar MongoDB
global.whatsappStates = global.whatsappStates || {};

const crearClienteWhatsApp = async (consultorioId) => {
    const idStr = consultorioId.toString();

    if (global.whatsappClients[idStr]) {
        console.log(`ℹ️ El cliente del consultorio ${idStr} ya está activo.`);
        return global.whatsappClients[idStr];
    }

    global.inicializandoClientes[idStr] = true;

    global.whatsappStates[idStr] = {
        whatsappStatus: 'INICIALIZANDO',
        whatsappQR: ''
    };

    console.log(`🤖 [KLYNTIC] Iniciando motor Puppeteer para Consultorio ID: ${idStr}`);

    try {
        // Inicializamos el almacén de sesiones de MongoDB
        const store = new MongoStore({ mongoose: mongoose });

        const isProduction = process.env.NODE_ENV === 'production';


        const client = new Client({

            //Inicializamos el cliente con la estrategia Remota
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 60000,
                clientId: `session-${idStr}` // 🚀 CORRECCIÓN 2: ID dinámico para separar los consultorios en Atlas
            }),
            // authStrategy: new LocalAuth({
            //     clientId: `consultorio_${idStr}`,
            //     dataPath: './.wwebjs_auth'
            // }),
            // 🚀 CORRECCIÓN 1: Eliminamos webVersionCache conflictivo. 
            // Dejamos que la librería use su propia estrategia nativa actualizada.
            puppeteer: {
                headless: true,
                defaultViewport: { width: 10, height: 10 }, // 🚀 Reduce la RAM visual a casi cero
                executablePath: isProduction
                    ? undefined
                    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Evita que se quede sin memoria RAM en Render
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-extensions',
                    '--disable-blink-features=AutomationControlled',
                    // ENGAÑA A WHATSAPP: Simula ser un Google Chrome real de escritorio
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',

                    // 🚀 CORRECCIÓN SINTAXIS Y LÍMITE: Bajamos a 256MB sin comillas para no asfixiar a Node.js en Render
                    '--js-flags=--max-old-space-size=180', // 🚀 Bajamos a 180MB para dejarle el resto a Express/Mongo
                    '--single-process', // 🚀 CRÍTICO: Fuerza a Chrome a usar un solo hilo de RAM en lugar de tres

                    '--disable-speech-api',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-breakpad',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-default-apps',
                    '--disable-features=Translate',
                    '--disable-ipc-flooding-protection',
                    '--disable-renderer-backgrounding',
                    '--mute-audio',
                    '--no-default-browser-check'
                ]
            }
        });

        // =========================================================================
        // 📡 EVENTO QR: Genera y actualiza base de datos
        // =========================================================================
        client.on('qr', async (qr) => {
            console.log(`✨ [CONSOLA] ¡QR Generado con éxito para consultorio: ${idStr}!`);
            try {
                const qrBase64 = await QRCode.toDataURL(qr, {
                    errorCorrectionLevel: 'L',
                    margin: 2,
                    width: 300
                });

                // Verificación de existencia del objeto global
                if (!global.whatsappStates[idStr]) global.whatsappStates[idStr] = {};

                global.whatsappStates[idStr].whatsappStatus = 'ESPERANDO_QR';
                global.whatsappStates[idStr].whatsappQR = qrBase64;

                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'ESPERANDO_QR',
                    whatsappQR: qrBase64
                });

                // 🚀 Envía el evento por Sockets al frontend de Angular
                if (global.io) {
                    global.io.emit('whatsapp-status-changed', {
                        doctorId: idStr,
                        whatsappStatus: 'ESPERANDO_QR',
                        whatsappQR: qrBase64
                    });
                    console.log(`📡 [SOCKET] Evento QR enviado a Angular para ID: ${idStr}`);
                }

            } catch (err) {
                console.error('Error generando QR Base64:', err.message);
            }
        });

        // =========================================================================
        // 🚀 EVENTO READY
        // =========================================================================
        client.on('ready', async () => {
            console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${idStr}!`);
            if (global.inicializandoClientes) delete global.inicializandoClientes[idStr];
            global.whatsappStates[idStr] = { whatsappStatus: 'CONECTADO', whatsappQR: '' };
            global.whatsappClients[idStr] = client; // Se guarda la instancia una vez operativa

            try {
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'CONECTADO',
                    whatsappQR: '',
                    whatsappConnectedAt: new Date()
                });

                if (global.io) {
                    global.io.emit('whatsapp-status-changed', {
                        doctorId: idStr,
                        whatsappStatus: 'CONECTADO',
                        whatsappQR: ''
                    });
                }
            } catch (dbErr) {
                console.error('Error actualizando BD en ready:', dbErr.message);
            }
        });
        // =========================================================================
        // ❌ EVENTO REMOTE SESSION SAVED (Garantiza persistencia en Atlas)
        // =========================================================================
        client.on('remote_session_saved', () => {
            console.log(`💾 Sesión de WhatsApp guardada con éxito en Atlas para: ${idStr}`);
        });

        // =========================================================================
        // ❌ EVENTO DISCONNECTED
        // =========================================================================
        client.on('disconnected', async (reason) => {
            console.log(`❌ WhatsApp desconectado en consultorio ${idStr}. Razón: ${reason}`);
            delete global.whatsappClients[idStr];
            if (global.inicializandoClientes) delete global.inicializandoClientes[idStr];
            if (global.whatsappStates[idStr]) delete global.whatsappStates[idStr];

            try {
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'DESCONECTADO',
                    whatsappQR: '',
                    whatsappConnectedAt: null
                });

                if (global.io) {
                    global.io.emit('whatsapp-status-changed', {
                        doctorId: idStr,
                        whatsappStatus: 'DESCONECTADO',
                        whatsappQR: ''
                    });
                }
            } catch (dbErr) {
                console.error('Error al actualizar BD en disconnected:', dbErr.message);
            }
        });


        // =========================================================================
        // 🏁 INICIALIZACIÓN (Eventos declarados ANTES de inicializar)
        // =========================================================================
        try {
            console.log(`⏳ Lanzando inicialización de Puppeteer en segundo plano para ${idStr}...`);

            if (!global.inicializandoClientes) global.inicializandoClientes = {};
            global.inicializandoClientes[idStr] = true;

            // 🚀 ESTA ES LA ÚNICA INICIALIZACIÓN QUE DEBE QUEDAR
            client.initialize().catch(err => {
                console.error(`Error interno en initialize de cliente ${idStr}:`, err.message);
                global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
            });

        } catch (error) {
            console.error(`Error crítico creando cliente ${idStr}:`, error.message);
            global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
        }


    } catch (error) {
        console.error(`Error crítico creando cliente ${idStr}:`, error.message);
        global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
    }
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
