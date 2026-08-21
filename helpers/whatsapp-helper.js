// const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');//modo pago para guardar RemoteAuth
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo'); // 🚀 CORRECCIÓN 1: Importación obligatoria
const Consultorio = require('../models/consultorio');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const path = require('path');

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
            // 🚀 SOLUCIÓN AL BLOQUEO DEL TELÉFONO: Forzar la última firma web validada de WhatsApp
            // webVersionCache: {
            //     type: 'remote',
            //     remotePath: 'https://githubusercontent.com'
            // },
            // 🚀 ALTERNATIVA: Obliga al bot a usar su propio motor local instalado
            webVersionCache: {
                type: 'local'
            },
            // 🚀 CORRECCIÓN 1: Eliminamos webVersionCache conflictivo. 
            // Dejamos que la librería use su propia estrategia nativa actualizada.
            puppeteer: {
                headless: true,
                cacheDirectory: path.resolve('/opt/render/project/src/.cache/puppeteer'),  // Ajusta los '..' si tu archivo está en una subcarpeta
                defaultViewport: { width: 800, height: 600 }, // 🚀 Reduce la RAM visual a casi cero
                executablePath: isProduction
                    ? undefined
                    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                args: [
                    // 🛡️ Seguridad y Contenedorización (Crucial para Render/Linux)
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Evita que se quede sin memoria RAM en Render
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-extensions',
                    '--disable-blink-features=AutomationControlled',

                    // 🎭 Identidad: Simula ser un Google Chrome real de escritorio
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',

                    // 🎯 RENDIMIENTO SIN CONGELAMIENTO (Evita que WhatsApp Web se duerma en segundo plano)
                    '--disable-backgrounding-occluded-windows',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-background-networking',

                    // 🎯 REDUCCIÓN CRÍTICA: Bajamos el motor V8 interno de Chromium a 100MB 
                    // para evitar que Render mate el contenedor al descargar el zip de Mongo
                    '--js-flags=--max-old-space-size=100', 

                    // 🧹 Limpieza de procesos innecesarios
                    '--disable-speech-api',
                    '--disable-breakpad',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-default-apps',
                    '--disable-ipc-flooding-protection',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--disable-features=Translate,OptimizationHints,OptimizationHintsFetching,IntensiveWakeUpThrottling'

                ]
            }
        });
        // 🚀 OPTIMIZACIÓN SEGURA DE RAM: Interceptamos la página sin romper el núcleo de WhatsApp
        client.on('pup_page_created', async (page) => {
            try {
                await page.setRequestInterception(true);

                page.on('request', (request) => {
                    const resourceType = request.resourceType();

                    // ⚠️ SOLO bloqueamos lo que genuinamente consume RAM visual y no rompe el JS de WhatsApp
                    // Quitamos 'stylesheet' y 'other' de la lista negra
                    if (['image', 'font', 'media'].includes(resourceType)) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                });
            } catch (error) {
                console.error("❌ Error al configurar el interceptor de RAM:", error);
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

                // 🎯 CORRECCIÓN AQUÍ: Cambiamos findByIdAndUpdate por findOneAndUpdate 
                // para buscar por tu columna de texto e impedir que Mongoose rompa la asincronía.
                await Consultorio.findOneAndUpdate(
                    { _id: idStr }, // 🎯 Guardamos directamente en la llave primaria String
                    {
                        whatsappStatus: 'ESPERANDO_QR',
                        whatsappQR: qrBase64
                    }
                );

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
                console.error('❌ Error generando QR Base64:', err.message);
            }
        });


        // =========================================================================
        // 🚀 EVENTO READY
        // =========================================================================
        client.on('ready', async () => {
            console.log(`🚀 ¡WhatsApp conectado para el consultorio: ${idStr}!`);
            if (global.inicializandoClientes) delete global.inicializandoClientes[idStr];
            global.whatsappStates[idStr] = { whatsappStatus: 'CONECTADO', whatsappQR: '' };
            global.whatsappClients[idStr] = client;

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

                // 🚀 BLINDAJE DE RAM PARA RENDER: Auto-cierre de Puppeteer tras sincronizar
                // Esperamos 30 segundos para que RemoteAuth termine de subir el ZIP a Atlas
                setTimeout(async () => {
                    console.log(`♻️ Liberando RAM: Cerrando Puppeteer para el consultorio ${idStr}`);
                    try {
                        // Desconectamos el cliente de forma limpia. 
                        // Esto cierra Chromium pero mantiene la sesión viva en MongoDB Atlas.
                        await client.destroy();

                        // Limpiamos la instancia global para liberar la memoria RAM de Node.js
                        delete global.whatsappClients[idStr];

                        console.log(`✅ RAM Liberada exitosamente para ${idStr}.`);
                    } catch (destroyErr) {
                        console.error('Error al liberar Puppeteer:', destroyErr.message);
                    }
                }, 30000); // 30 segundos de margen

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
