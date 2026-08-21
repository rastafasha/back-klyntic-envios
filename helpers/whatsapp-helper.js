// const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');//modo pago para guardar RemoteAuth
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo'); // 🚀 CORRECCIÓN 1: Importación obligatoria
const Consultorio = require('../models/consultorio');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs'); 

// Inicialización segura de mapas globales en memoria RAM
global.whatsappClients = global.whatsappClients || {};
global.inicializandoClientes = global.inicializandoClientes || {};
global.whatsappStates = global.whatsappStates || {};

// 🎯 CONTROL DE DESCARGA EN CALIENTE PARA RENDER
async function asegurarNavegadorInstalado() {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // 🎯 CRÍTICO: Si no es producción (estás en tu Mac), no descargues nada y sal de la función
        if (!isProduction) {
            console.log("💻 [LOCAL] Entorno de desarrollo detectado. Saltando descarga en caliente de Chrome.");
            return;
        }

        console.log("🔍 [PRODUCCIÓN] Comprobando disponibilidad del navegador físico Chrome...");
        const { downloadBrowsers } = require('puppeteer/internal/node/install.js');
        await downloadBrowsers();
        console.log("📦 [PUPPETEER] ¡Navegador verificado con éxito en el servidor!");
        
    } catch (browserErr) {
        console.warn("⚠️ El instalador interno no requirió descarga manual:", browserErr.message);
    }
}


const crearClienteWhatsApp = async (consultorioId) => {
   const idStr = consultorioId.toString();

    // 🎯 CANDADO INTERNO ULTRA SEGURO: 
    // Si la instancia ya existe en los mapas globales, matamos la función al instante
    if (global.whatsappClients[idStr]) {
        console.log(`⚠️ [PUPPETEER] Instancia ya activa en RAM para ID: ${idStr}. Cancelando duplicado.`);
        return global.whatsappClients[idStr];
    }

    // Si ya se está inicializando en este momento, no permitas abrir otro Chromium
    if (global.whatsappStates[idStr]?.whatsappStatus === 'INICIALIZANDO' && global.whatsappClients[idStr]) {
        console.log(`🛑 [PUPPETEER] Bloqueo de seguridad: Ya hay un Chromium abriéndose para el ID: ${idStr}`);
        return;
    }

    global.inicializandoClientes[idStr] = true;

    global.whatsappStates[idStr] = {
        whatsappStatus: 'INICIALIZANDO',
        whatsappQR: ''
    };

    // 🎯 ADICIÓN CRÍTICA: Forzamos la descarga en caliente antes de instanciar el cliente
    await asegurarNavegadorInstalado();

    console.log(`🤖 [KLYNTIC] Iniciando motor Puppeteer para Consultorio ID: ${idStr}`);

    try {
        // Inicializamos el almacén de sesiones de MongoDB
        const store = new MongoStore({ mongoose: mongoose });
        const isProduction = process.env.NODE_ENV === 'production';

        // 🎯 DEFINICIÓN DINÁMICA DE RUTA SEGÚN EL ENTORNO
        // En Render usa la ruta absoluta de Linux, en tu Mac usa una carpeta interna de tu proyecto (.cache)
        const rutaCacheSegura = isProduction
            ? path.resolve('/opt/render/project/src/.cache/puppeteer')
            : path.resolve(__dirname, '..', '.cache', 'puppeteer'); // Ajusta los '..' si estás en una subcarpeta


        const client = new Client({
            // En la raíz del objeto new Client({ ... })
            authTimeoutMs: 120000, // ⏱️ Subimos a 2 minutos el tiempo de espera de autenticación
            qrMaxImages: 3,        // Permite reintentar el dibujado del QR si el primer frame se cae

            
            //Inicializamos el cliente con la estrategia Remota
            authStrategy: new RemoteAuth({
                store: store,
                backupSyncIntervalMs: 300000, 
                clientId: `session-${idStr}_v2`, // 🚀 CORRECCIÓN 2: ID dinámico para separar los consultorios en Atlas
                 // 🎯 LA SOLUCIÓN CRÍTICA: Forzamos a la librería a crear los archivos temporales (.zip)
                // en la carpeta /tmp de Linux, que sí tiene permisos de escritura en Render.
                dataPath: isProduction ? '/tmp' : './.wwebjs_auth' 
            }),
            // 🚀 ALTERNATIVA: Obliga al bot a usar su propio motor local instalado
            webVersionCache: {
                type: 'local'
            },
            // 🚀 CORRECCIÓN 1: Eliminamos webVersionCache conflictivo. 
            // Dejamos que la librería use su propia estrategia nativa actualizada.
            puppeteer: {
                headless: true,
                // 🎯 PASO 1: Le indicamos la carpeta raíz de caché donde se descargó la versión 151
                cacheDirectory: path.resolve('/opt/render/project/src/.cache/puppeteer'),  // Ajusta los '..' si tu archivo está en una subcarpeta
                defaultViewport: { width: 800, height: 600 }, // 🚀 Reduce la RAM visual a casi cero
                // 🎯 PASO 2: FORZAMOS EL EJECUTABLE EXACTO EN RENDER
                // Con esto, la librería dejará de buscar la versión 146 vieja y abrirá la 151 que ya está en el servidor
               // 🎯 RUTA DEL EJECUTABLE
                // En Render forzamos el binario 151, en tu Mac dejamos que use tu Chrome comercial instalado
                executablePath: isProduction
                    ? '/opt/render/project/src/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome'
                    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Cambia a tu ruta local de Mac
                    
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

                    // 🎯 REFUERZO DE ACERO CONTRA "FRAME WAS DETACHED":
                    '--disable-software-rasterizer', // Evita que la CPU intente dibujar gráficos 3D
                    // Incrementa la prioridad del proceso del navegador en Linux
                    '--process-per-tab',

                    // 🎯 REDUCCIÓN CRÍTICA: Bajamos el motor V8 interno de Chromium a 100MB 
                    // para evitar que Render mate el contenedor al descargar el zip de Mongo
                    '--js-flags=--max-old-space-size=80', 
                    'takeoverOnConflict: true',

                    // 🧹 Limpieza de procesos innecesarios
                    '--disable-speech-api',
                    '--disable-breakpad',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-default-apps',
                    '--disable-ipc-flooding-protection',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--disable-features=Translate,OptimizationHints,OptimizationHintsFetching,IntensiveWakeUpThrottling',
                    // 🎯 LAS DOS LÍNEAS DE BLINDAJE PARA FORZAR EL QR:
                    '--disable-web-security', // 🚀 Permite que la librería inyecte los scripts del QR sin bloqueos de origen de Chromium
                    '--force-device-scale-factor=1' // 🚀 Fuerza a Chrome a dibujar los elementos a escala real para que la librería capture el texto del QR

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
            global.whatsappClients[idStr] = client; // Mantiene la instancia viva en RAM para enviar mensajes

            try {
                // 🎯 CORRECCIÓN 1: Usamos findOneAndUpdate con la llave primaria String real
                await Consultorio.findOneAndUpdate(
                    { _id: idStr }, 
                    {
                        whatsappStatus: 'CONECTADO',
                        whatsappQR: '',
                        whatsappConnectedAt: new Date()
                    }
                );

                if (global.io) {
                    global.io.emit('whatsapp-status-changed', {
                        doctorId: idStr,
                        whatsappStatus: 'CONECTADO',
                        whatsappQR: ''
                    });
                }

                // 🎯 CORRECCIÓN 2: ELIMINAMOS EL TIMEOUT DE AUTO-DESTRUCCIÓN.
                // Dejamos que el cliente se quede encendido en segundo plano para escuchar mensajes.

            } catch (dbErr) {
                console.error('❌ Error actualizando BD en ready:', dbErr.message);
            }
        });

        // =========================================================================
        // 💾 EVENTO REMOTE SESSION SAVED
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
                // 🎯 CORRECCIÓN 3: Ajuste de consulta a la llave primaria real
                await Consultorio.findOneAndUpdate(
                    { _id: idStr },
                    {
                        whatsappStatus: 'DESCONECTADO',
                        whatsappQR: '',
                        whatsappConnectedAt: null
                    }
                );

                if (global.io) {
                    global.io.emit('whatsapp-status-changed', {
                        doctorId: idStr,
                        whatsappStatus: 'DESCONECTADO',
                        whatsappQR: ''
                    });
                }
            } catch (dbErr) {
                console.error('❌ Error al actualizar BD en disconnected:', dbErr.message);
            }
        });

        // =========================================================================
        // 🏁 INICIALIZACIÓN (Eventos declarados ANTES de inicializar)
        // =========================================================================
        try {
            console.log(`⏳ Lanzando inicialización de Puppeteer en segundo plano para ${idStr}...`);

            if (!global.inicializandoClientes) global.inicializandoClientes = {};
            global.inicializandoClientes[idStr] = true;

            // 🎯 EL PARCHE DE ORO CONTRA EL BUG ENOENT DE WHATSAPP-WEB.JS
            // Creamos un archivo zip vacío en la raíz para que la librería no se caiga al intentar buscarlo
            const nombreZipFantasma = `RemoteAuth-session-${idStr}_v2.zip`;
            if (!fs.existsSync(nombreZipFantasma)) {
                fs.writeFileSync(nombreZipFantasma, ''); // Crea el archivo vacío de inmediato
                console.log(`🛡️ [PARCHE] Archivo fantasma ${nombreZipFantasma} creado con éxito para burlar el bug.`);
            }

            // 🚀 Inicialización nativa
            client.initialize().catch(err => {
                console.error(`❌ Error interno en initialize de cliente ${idStr}:`, err.message);
                global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
                global.inicializandoClientes[idStr] = false;
                if (global.whatsappClients[idStr]) delete global.whatsappClients[idStr];
            });

        } catch (error) {
            console.error(`❌ Error crítico creando cliente ${idStr}:`, error.message);
            global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
            global.inicializandoClientes[idStr] = false;
        }

    } catch (error) {
        console.error(`❌ Error crítico en el try superior del cliente ${idStr}:`, error.message);
        global.whatsappStates[idStr] = { whatsappStatus: 'ERROR', whatsappQR: '' };
        global.inicializandoClientes[idStr] = false;
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
