require('dotenv').config();
const express = require('express');
const { dbConnection } = require('./database/config');
const cors = require('cors');
const path = require('path');
const socketIO = require('socket.io');
require('./config/recordatorios-cron');

// require('./config/cron-envioswhatsapp');// cuando pague el servidor 
const { restaurarSesionesDeDoctores } = require('./controllers/consultoriosController');
// El delay auxiliar para el index
const delay = ms => new Promise(res => setTimeout(res, ms));

// Check if we're running on a serverless platform
const isServerless = process.env.RENDER === '1' || process.env.VERCEL === '1';
const isRender = process.env.RENDER === '1';

// Only require serverless-http if not on traditional server
let serverless;
if (!isServerless || isServerless && process.env.SERVERLESS) {
    serverless = require('serverless-http');
}

//notifications
const webpush = require('web-push');
const bodyParser = require('body-parser');

//crear server de express
const app = express();
const server = require('http').Server(app);

// Initialize socket.io with the server
// Direcciones estáticas permitidas (Locales y Paneles Administrativos fijos)
const allowedOrigins = [
    "http://localhost:4200",
    "http://localhost:4203",
    "http://localhost:4206",
    "http://localhost:4207",
    "http://localhost:3001",
    "http://localhost:4300",
    "https://consultorio.klyntic.com",
    "https://pconsultorio.klyntic.com",
];

// Configuración compartida inteligente para SaaS Multi-Tenant
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const esSubdominioKlyntic = /\.klyntic\.com$/.test(origin) || origin === "https://klyntic.com" || origin === "http://klyntic.com";

        if (esSubdominioKlyntic || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`[CORS RECHAZADO]: El origen ${origin} no tiene permisos.`);
            callback(new Error('Origin no permitido por CORS'));
        }
    },

    // 🛡️ Autoriza explícitamente al navegador a enviar los tokens de Angular
    allowedHeaders: ["Content-Type", "Authorization", "x-token", "Accept", "auth_token"],

    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,

    // 🚀 CORRECCIÓN CRÍTICA: Cambiamos 204 por 200 para que Render no ignore los Preflights bajo alta carga
    optionsSuccessStatus: 200
};

// 1. Aplicar a las rutas normales de Express (REST API)

app.use(cors(corsOptions));

// 2. Aplicar a Socket.io
const io = socketIO(server, {
    cors: corsOptions,
    pingTimeout: 60000,   // 🔥 Agrega esto para estabilizar WebSockets en Render
    pingInterval: 25000   // 🔥 Agrega esto para reemplazar el setInterval viejo
});

// Exportamos io para el resto de la app
module.exports.io = io;

// 🔥 LA CLAVE: Cargamos los eventos de los sockets PASÁNDOLE el io ya creado
require('./sockets/socket')(io);


//lectura y parseo del body
app.use(express.json());

// Wrap everything in async function to properly await dbConnection
// =========================================================================
// 🚀 ARRANQUE SECUENCIAL COMPLETO 
// =========================================================================

const startServer = async () => {
    try {
        // 1. Conectamos la base de datos primero de forma limpia
        await dbConnection();
        console.log('📦 Inicialización de base de datos completada.');

        // =========================================================================
        // ⚙️ MIDDLEWARES GLOBALES (¡DEBEN IR ANTES DE LAS RUTAS!)
        // =========================================================================
        app.use(express.json()); // Reemplaza de forma nativa a bodyParser.json()
        app.use(express.urlencoded({ extended: true }));
        // app.use(express.static(path.join(__dirname, 'public'))); // Directorio público limpio

        // Configuración de WebPush Notifications
        const vapidKeys = {
            "publicKey": process.env.VAPI_KEY_PUBLIC,
            "privateKey": process.env.VAPI_KEY_PRIVATE
        };
        webpush.setVapidDetails(
            'mailto:mercadocreativo@gmail.com',
            vapidKeys.publicKey,
            vapidKeys.privateKey,
        );

        // =========================================================================
        // 🌐 DECLARACIÓN DE RUTAS DE TU API
        // =========================================================================
        app.use('/api/notipush', require('./routes/notipush'));
        // === SECCIÓN SAAS MÉDICO (Klyntic) ===
        app.use('/api/klyntic/notificaciones', require('./routes/notificacionesKlynticRoutes'));
        app.use('/api/klyntic/consultorios', require('./routes/consultoriosRoutes'));
        app.use('/api/tasadollarbcv', require('./routes/tasadollarbcv'));
        app.use('/api/tasas', require('./routes/tasas'));
        app.use('/api/envio', require('./routes/envio'));

        // Test Endpoint de bienvenida
        app.get("/bienvenida", (req, res) => {
            res.json({ message: "Welcome to nodejs." });
        });

        // =========================================================================
        // 🚨 ENCENDIDO DEL PUERTO EN RENDER (Limpio y Optimizado)
        // =========================================================================

        // Render asigna un puerto dinámico. Usamos 10000 como respaldo (puerto estándar de Render).
        const PORT = process.env.PORT || 10000;

        // Escuchamos en '0.0.0.0' para permitir conexiones externas en el contenedor de Render
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Servidor Klyntic ejecutándose con éxito en puerto: ${PORT}`);

            // Ejecutamos la restauración de médicos en segundo plano.
            // Al NO usar 'await' aquí, el servidor le avisa de inmediato a Render que ya está "Live".
            console.log('⏱ Iniciando restauración progresiva de médicos en segundo plano...');

            restaurarSesionesDeDoctores()
                .then(() => console.log('✅ Todas las sesiones de doctores han sido procesadas.'))
                .catch(err => console.error('❌ Error al restaurar sesiones de doctores:', err));
        });

        // =========================================================================
        // 🕳️ COMPATIBILIDAD FRONTEND (Al puro final, después de prender el puerto)
        // =========================================================================
        // app.get('*', (req, res) => {
        //     res.sendFile(path.resolve(__dirname, 'public', 'index.html')); // Envía el index real de Angular en producción
        // });

        // Global error handling middleware
        app.use((err, req, res, next) => {
            console.error('Global error handler caught an error:', err);
            res.status(500).json({ ok: false, msg: 'Internal Server Error', error: err.message || err.toString() });
        });

    } catch (error) {
        console.error('❌ Error crítico inicializando el servidor:', error.message);
        process.exit(1);
    }
};


// Start the server
startServer().catch(err => {
    console.error('Error starting server:', err);
    process.exit(1);
});







// Agrupa todas las exportaciones al final de tu index.js de forma limpia:
const exportaciones = { app, server, io };

if (typeof serverless !== 'undefined' && serverless) {
    exportaciones.handler = serverless(app);
}

module.exports = exportaciones;

