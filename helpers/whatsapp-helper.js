const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const Consultorio = require('../models/consultorio');
const QRCode = require('qrcode');

global.whatsappClients = global.whatsappClients || {};
global.inicializandoClientes = global.inicializandoClientes || {};
// NUEVO: Objeto global volátil para estados y QR rápidos sin saturar MongoDB
global.whatsappStates = global.whatsappStates || {};

const crearClienteWhatsApp = async (consultorioId) => {
    // 🚀 Mantenemos el ID original para la librería, pero creamos un string solo para las llaves de la RAM
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
            // 🚀 IMPORTANTE: Usamos el ID original/limpio aquí para que coincida con tus sesiones previas
            authStrategy: new LocalAuth({
                clientId: `consultorio_${idStr}`,
                dataPath: './.wwebjs_auth'
            }),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://githubusercontent.com'
            },
            puppeteer: {
                // 🚀 TRUE para que corra invisible en segundo plano consumiendo la mitad de RAM
                headless: true,
                // 🚀 Híbrido: Si está en Render usa su Chrome nativo, si está en desarrollo usa el tuyo de Mac
                // 🚀 SI ESTÁ EN PRODUCCIÓN DEJAMOS INDEFINIDO PARA QUE DISPARE LA DESCARGA DEL SCRIPT
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
                    // 🚀 OPTIMIZACIONES EXTREMAS DE RAM PARA SERVIDORES PEQUEÑOS:
                    '--js-flags="--max-old-space-size=150"', // Limita el motor V8 de Chromium a usar max 150MB
                    '--disable-canvas-features',
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
                    '--enable-features=NetworkServiceInProcess2',
                    '--mute-audio',
                    '--no-default-browser-check'
                    
                ]
            }
        });

        // =========================================================================
        // 📡 EVENTOS ACTUALIZADOS USANDO ID STRING PARA LA MEMORIA
        // =========================================================================
        client.on('qr', async (qr) => {
            console.log(`✨ [CONSOLA] ¡QR Generado con éxito para consultorio: ${idStr}!`);
            try {
                const qrBase64 = await QRCode.toDataURL(qr);

                global.whatsappStates[idStr].whatsappStatus = 'ESPERANDO_QR';
                global.whatsappStates[idStr].whatsappQR = qrBase64;

                Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'ESPERANDO_QR',
                    whatsappQR: qrBase64
                }).catch(err => console.error('Error BD QR:', err.message));

            } catch (err) {
                console.error('Error generando QR Base64:', err.message);
            }
        });
        // =========================================================================
        // 🚀 EVENTO READY: Se dispara cuando el escaneo es exitoso
        // =========================================================================
        client.on('ready', async () => {
            console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${idStr}!`);

            // 1. FORZAMOS EL BORRADO DEL SEMÁFORO DE ARRANQUE
            delete global.inicializandoClientes[idStr];

            // 2. ACTUALIZAMOS LA MEMORIA RAM DE INMEDIATO CON EL ESTADO DEFINITIVO
            global.whatsappStates = global.whatsappStates || {};
            global.whatsappStates[idStr] = {
                whatsappStatus: 'CONECTADO',
                whatsappQR: '' // Limpiamos el string Base64 viejo
            };

            // 3. Guardamos en la Base de Datos para persistencia a largo plazo
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
        // ❌ EVENTO DISCONNECTED: Se dispara si el médico cierra sesión desde el móvil
        // =========================================================================
        client.on('disconnected', async (reason) => {
            console.log(`❌ WhatsApp desconectado en consultorio ${idStr}. Razón: ${reason}`);

            // 1. Limpiamos por completo este ID de todas las memorias RAM
            delete global.whatsappClients[idStr];
            delete global.inicializandoClientes[idStr];
            if (global.whatsappStates) {
                delete global.whatsappStates[idStr];
            }

            // 2. 🚨 CRÍTICO: Devolvemos la base de datos a DESCONECTADO para que Angular permita revincular
            try {
                await Consultorio.findByIdAndUpdate(consultorioId, {
                    whatsappStatus: 'DESCONECTADO',
                    whatsappQR: '',
                    whatsappConnectedAt: null
                });
                console.log(`[ID ${idStr}] ✅ MongoDB actualizado a DESCONECTADO por desvinculación.`);
            } catch (dbErr) {
                console.error('Error al actualizar BD en disconnected:', dbErr.message);
            }
        });


        // =========================================================================
        // 🏁 INICIALIZACIÓN ASÍNCRONA BLINDADA PARA LA RAM DE RENDER
        // =========================================================================
        console.log(`⏳ Lanzando inicialización de Puppeteer en segundo plano para ${idStr}...`);
        
        client.initialize().then(() => {
            global.whatsappClients[idStr] = client;

            // 🚀 INTERCEPTOR ANTI-CAÍDAS: Filtramos el tráfico gráfico en el segundo uno
            setTimeout(async () => {
                try {
                    const page = client.pupPage;
                    if (page) {
                        await page.setRequestInterception(true);
                        page.on('request', (request) => {
                            const resourceType = request.resourceType();
                            // Bloqueamos avatares, imágenes pesadas, hojas de estilo CSS secundarias y tipografías
                            if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                                request.abort();
                            } else {
                                request.continue();
                            }
                        });
                        console.log(`🛡️ [RAM PROTECTED] Interceptor de red activado con éxito para ID: ${idStr}`);
                    }
                } catch (interceptorErr) {
                    console.error('Error al inyectar el interceptor de RAM:', interceptorErr.message);
                }
            }, 2000); // Esperamos 2 segundos a que Puppeteer instancie la pestaña interna

        }).catch(err => {
            console.error(`❌ Falló initialize diferido para ${idStr}:`, err.message);
            delete global.inicializandoClientes[idStr];
            delete global.whatsappStates[idStr];
        });

        return client;

    } catch (error) {
        delete global.inicializandoClientes[idStr];
        return null;
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
