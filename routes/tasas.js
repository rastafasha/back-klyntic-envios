const { Router } = require('express');
const router = Router();
const { sincronizarTasasOficiales } = require('../services/cron-tasas.service');

// =========================================================================
// ⏰ 1. ENDPOINT AUTOMÁTICO PARA CRON-JOB.ORG (Método GET Obligatorio)
// =========================================================================
router.get('/tasks/sync-tasa-bcv', async (req, res) => {
    try {
        console.log('⏰ [CRON-JOB.ORG] Petición externa recibida. Liberando conexión inmediatamente...');
        
        // 🎯 1. RESPUESTA INMEDIATA: Evita el Timeout de 30 segundos en cron-job.org
        res.status(202).json({ 
            ok: true, 
            msg: 'Petición aceptada. Sincronizando la tasa en segundo plano...' 
        });

        // 🎯 2. PROCESAMIENTO SEGURO EN SEGUNDO PLANO (Aislado de la respuesta HTTP)
        // Usamos una función autoejecutable asíncrona (IIFE) para un manejo de errores robusto
        (async () => {
            try {
                const tasa = await sincronizarTasasOficiales();
                
                // Validación estricta que añadimos en la ruta anterior
                const tasaNumerica = parseFloat(tasa);

                if (!isNaN(tasaNumerica) && tasaNumerica > 0) {
                    console.log(`✅ Tasa sincronizada con éxito en segundo plano: ${tasaNumerica}`);
                    
                    // Notificamos a Angular por Sockets en tiempo real
                    if (global.io) {
                        global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
                    }
                } else {
                    console.error('❌ Fallo en la sincronización automática: Formato numérico inválido.');
                }
            } catch (asyncErr) {
                // 🚀 AQUÍ ESTÁ EL BLINDAJE: Cualquier fallo asíncrono muere aquí y no tumba Render
                console.error('❌ Error crítico ejecutando la sincronización en segundo plano:', asyncErr.message);
            }
        })(); // El () final ejecuta la función en paralelo de inmediato

    } catch (error) {
        // Este catch solo captura errores si res.status(202) llega a fallar catastróficamente
        console.error('❌ Error crítico síncrono en la ruta del cronjob:', error.message);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    }
});



// =========================================================================
// 🎛️ 2. ENDPOINT MANUAL PARA EL PANEL ADMINISTRATIVO (Método POST)
// =========================================================================
router.post('/forzar-actualizacion-tasa', async (req, res) => {
    // 🎯 1. DECLARAMOS LA VARIABLE DEL TEMPORIZADOR FUERA PARA PODER LIMPIARLA
    let timeoutId = null;

    try {
        console.log('🎛️ [PANEL] Ejecutando sincronización manual de tasa solicitada por el usuario...');

        // Promesa con tiempo límite
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('Tiempo de espera agotado al conectar con el servidor cambiario'));
            }, 25000);
        });

        // Corremos la sincronización y el temporizador en carrera
        const tasa = await Promise.race([
            sincronizarTasasOficiales(),
            timeoutPromise
        ]);

        // 🎯 2. LIMPIEZA INMEDIATA DE MEMORIA (Se cancela el reloj si el BCV respondió a tiempo)
        if (timeoutId) clearTimeout(timeoutId);

        // 🎯 3. VALIDACIÓN MATEMÁTICA ESTRICTA (Evita NaN, strings vacíos o ceros)
        const tasaNumerica = parseFloat(tasa);

        if (!isNaN(tasaNumerica) && tasaNumerica > 0) {
            
            // Notificamos por Sockets en tiempo real a todas las pantallas abiertas de Angular
            if (global.io) {
                global.io.emit('tasa-bcv-actualizada', { tasa: tasaNumerica });
                console.log(`📡 [SOCKET] Nueva tasa emitida globalmente: ${tasaNumerica}`);
            }
            
            return res.json({ 
                ok: true, 
                msg: 'Tasa oficial actualizada con éxito desde el panel administrativo.', 
                tasa: tasaNumerica 
            });

        } else {
            return res.status(400).json({ 
                ok: false, 
                msg: 'El portal cambiario respondió correctamente pero devolvió un formato de tasa inválido.' 
            });
        }

    } catch (error) {
        // 🎯 4. SEGURIDAD EN EL CATCH: Si la promesa dio timeout, también limpiamos el ID por si acaso
        if (timeoutId) clearTimeout(timeoutId);

        console.error('❌ Error crítico en forzar-actualizacion-tasa:', error.message);
        
        // Manejo amigable si el error fue por lentitud del BCV
        if (error.message.includes('Tiempo de espera')) {
            return res.status(504).json({ ok: false, msg: error.message });
        }

        return res.status(500).json({ ok: false, error: error.message });
    }
});



module.exports = router;
