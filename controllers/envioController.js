const { response } = require('express');
const { MessageMedia } = require('whatsapp-web.js');

/**
 * 📦 ENVIAR DOCUMENTO MÉDICO (Recetas, Informes, Órdenes de Exámenes)
 * Este endpoint recibe el PDF/Imagen desde Laravel/Angular y lo despacha al paciente
 */
function enviarDocumentoPaciente(req, res) {
    // 1. Control de seguridad por si no viaja el documento adjunto
    if (!req.file) {
        return res.status(400).json({ ok: false, message: 'No se recibió ningún documento médico adjunto.' });
    }

    // 2. Mapeamos la terminología al negocio de salud
    const nombrePaciente = req.body.nombrePaciente || 'Paciente';
    const telefonoPaciente = req.body.telefono; 
    const nombreDoctor = req.body.nombreDoctor || 'su especialista';
    
    // 🔥 CLAVE MULTI-TENANT: Resuelve a qué médico pertenece la línea de WhatsApp activa en RAM
    const consultorioId = req.body.consultorioId; 

    // =========================================================================
    // 💬 DISPARO EXCLUSIVO VÍA WHATSAPP MULTI-TENANT
    // =========================================================================
    if (consultorioId && telefonoPaciente && telefonoPaciente.trim() !== '') {
        
        // Formateamos el número telefónico al estándar de WhatsApp (@c.us)
        let telefonoLimpio = telefonoPaciente.replace(/\D/g, '');
        if (telefonoLimpio.startsWith('0')) {
            telefonoLimpio = '58' + telefonoLimpio.substring(1);
        }
        if (!telefonoLimpio.endsWith('@c.us')) {
            telefonoLimpio = `${telefonoLimpio}@c.us`;
        }

        // Construimos un mensaje profesional y empático para el entorno médico
        const mensajeTexto = `✨ *KLYNTIC CONSULTORIO DIGITAL* ✨\n\n👋 Hola, estimado(a) *${nombrePaciente}*.\nLe escribe el equipo del(la) *${nombreDoctor}*.\n\n📄 Adjunto a este mensaje encontrará su documento digital (*Receta Médica / Informe*).`;

        try {
            // Buscamos la instancia activa de Puppeteer de ESTE doctor específico en la RAM del servidor
            const clienteWhatsApp = global.whatsappClients && global.whatsappClients[consultorioId];
            const estadoWhatsApp = global.whatsappStates && global.whatsappStates[consultorioId];

            if (clienteWhatsApp && estadoWhatsApp && estadoWhatsApp.whatsappStatus === 'CONECTADO') {
                
                console.log(`📦 Preparando y empaquetando PDF/Imagen para el paciente de la consulta ID: ${consultorioId}`);
                
                // Transformamos el buffer del archivo en memoria a un objeto MessageMedia nativo de whatsapp-web.js
                const documentoMedia = new MessageMedia(
                    req.file.mimetype, 
                    req.file.buffer.toString('base64'), 
                    req.file.originalname
                );

                // Disparamos el archivo adjunto colocando el mensaje de texto como "pie de página" (caption)
                clienteWhatsApp.sendMessage(telefonoLimpio, documentoMedia, { caption: mensajeTexto })
                    .then(() => console.log(`✅ Documento médico entregado con éxito al paciente ${telefonoLimpio}`))
                    .catch(err => console.error('❌ Error físico de whatsapp-web.js al entregar el documento:', err.message));

            } else {
                console.log(`⚠️ El WhatsApp del consultorio ${consultorioId} no está activo o se encuentra desconectado.`);
            }

        } catch (errorEstructura) {
            console.error('❌ Error crítico estructurando el documento multimedia:', errorEstructura.message);
        }

    } else {
        console.log('⚠️ Faltan parámetros indispensables (consultorioId o teléfono) para despachar el documento.');
    }

    // 🚀 RESPUESTA INSTANTÁNEA EN MILISEGUNDOS: Evita picos de bloqueo en Render o Vercel
    return res.json({
        ok: true,
        message: 'El documento médico ha sido ingresado a la instancia del consultorio para su distribución.'
    });
}

module.exports = {
    enviarDocumentoPaciente,
};
