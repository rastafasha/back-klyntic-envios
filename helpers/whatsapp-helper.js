const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const Consultorio = require('../models/consultorio');
const QRCode = require('qrcode');

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

    global.whatsappStates = global.whatsappStates || {};
    global.whatsappStates[idStr] = {
        whatsappStatus: 'INICIALIZANDO',
        whatsappQR: ''
    };

    console.log(`🤖 [KLYNTIC] Iniciando motor Puppeteer para Consultorio ID: ${idStr}`);

    try {
        const isProduction = process.env.NODE_ENV === 'production';

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: `consultorio_${idStr}`,
                dataPath: './.wwebjs_auth'
            }),
            // 🚀 CORRECCIÓN 1: Eliminamos webVersionCache conflictivo. 
            // Dejamos que la librería use su propia estrategia nativa actualizada.
            puppeteer: {
                headless: true,
                executablePath: isProduction
                    ? undefined
                    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-extensions',
                    '--disable-blink-features=AutomationControlled',
                    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    // 🚀 CORRECCIÓN 2: Subimos a 512MB. Menos de esto crashea el lector QR de WhatsApp.
                    '--js-flags="--max-old-space-size=512"', 
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
                const qrBase64 = await QRCode.toDataURL(qr);

                global.whatsappStates[idStr].whatsappStatus = 'ESPERANDO_QR';
                global.whatsappStates[idStr].whatsappQR = qrBase64;

                // Cambiar el estado para que Angular lo reciba
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'ESPERANDO_QR',
                    whatsappQR: qrBase64
                });

            } catch (err) {
                console.error('Error generando QR Base64:', err.message);
            }
        });

        // =========================================================================
        // 🚀 EVENTO READY
        // =========================================================================
        client.on('ready', async () => {
            console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${idStr}!`);
            delete global.inicializandoClientes[idStr];

            global.whatsappStates[idStr] = {
                whatsappStatus: 'CONECTADO',
                whatsappQR: ''
            };

            try {
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'CONECTADO',
                    whatsappQR: '',
                    whatsappConnectedAt: new Date()
                });
                console.log(`[ID ${idStr}] BD actualizada con éxito a CONECTADO.`);
            } catch (dbErr) {
                console.error('Error actualizando BD en ready:', dbErr.message);
            }
        });

        // =========================================================================
        // ❌ EVENTO DISCONNECTED
        // =========================================================================
        client.on('disconnected', async (reason) => {
            console.log(`❌ WhatsApp desconectado en consultorio ${idStr}. Razón: ${reason}`);
            delete global.whatsappClients[idStr];
            delete global.inicializandoClientes[idStr];
            if (global.whatsappStates[idStr]) delete global.whatsappStates[idStr];

            try {
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'DESCONECTADO',
                    whatsappQR: '',
                    whatsappConnectedAt: null
                });
            } catch (dbErr) {
                console.error('Error al actualizar BD en disconnected:', dbErr.message);
            }
        });

        // =========================================================================
        // 🏁 INICIALIZACIÓN
        // =========================================================================
        console.log(`⏳ Lanzando inicialización de Puppeteer en segundo plano para ${idStr}...`);
        
        client.initialize().then(() => {
            global.whatsappClients[idStr] = client;

            // 🚀 CORRECCIÓN 3: El interceptor de tráfico multimedia SOLO se activa 
            // cuando el cliente ya se encuentra 'READY' (Conectado), no antes.
            client.on('ready', () => {
                setTimeout(async () => {
                    try {
                        const page = client.pupPage;
                        if (page) {
                            await page.setRequestInterception(true);
                            page.on('request', (request) => {
                                const resourceType = request.resourceType();
                                // Bloqueamos elementos pesados una vez ya iniciada la sesión
                                if (['image', 'media', 'font'].includes(resourceType)) {
                                    request.abort();
                                } else {
                                    request.continue();
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error al setear interceptor post-ready:', e.message);
                    }
                }, 5000);
            });
        }).catch(err => {
            console.error(`Error al inicializar cliente ${idStr}:`, err.message);
            global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
        });

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
