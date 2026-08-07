const { response } = require('express');
const { io } = require('../index');
const { enviarFacturaWhatsApp } = require('../helpers/whatsapp-helper'); // Si usas whatsapp-web.js
const nodemailer = require('nodemailer');
// confirguramos el tarnsporter de nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.HOST_EMAIL, // smtp.gmail.com
    port: process.env.PORT_EMAIL,
    secure: true, // true para puerto 465 (SSL)
    auth: {
        user: process.env.USER_EMAIL, // soporte@zlipmenu.com
        pass: process.env.PASS_email  // Tu contraseña real o de app
    },
    tls: {
        // Esto evita errores si el certificado SSL del servidor es autofirmado
        rejectUnauthorized: false
    }
});


// enviar factura al cliente, 
function enviarFactura(req, res) {
    if (!req.file) {
        return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo' });
    }

    const nombreCliente = req.body.nombrecliente || 'Cliente';
    const emailCliente = req.body.emailcliente;
    const telefonoCliente = req.body.telefono; 
    const nombreRestaurante = req.body.nombrerestaurante || 'nuestro restaurante';
    
    // IMPORTANTE: Asegúrate de enviar 'idtienda' en el FormData desde Angular
    const restauranteId = req.body.idtienda; 

    // ==========================================
    // CANAL 1: ENVIAR POR EMAIL (Si existe)
    // ==========================================
    // if (emailCliente && emailCliente.trim() !== '') {
    //     const mailOptions = {
    //         from: `"Soporte ZlipMenu" <${process.env.USER_EMAIL}>`,
    //         to: emailCliente,
    //         subject: `¡Hola ${nombreCliente}! Te enviamos la factura de tu compra`,
    //         text: `Hola ${nombreCliente}! Adjunto encontrarás la factura de tu compra en ${nombreRestaurante}.`,
    //         attachments: [{ filename: req.file.originalname, content: req.file.buffer }],
    //     };
    //     transporter.sendMail(mailOptions, (err) => { if (err) console.error('Error Email:', err); });
    // }

    // ==========================================
    // CANAL 2: WHATSAPP MULTI-TENANT AUTOMÁTICO
    // ==========================================
    if (restauranteId && telefonoCliente && telefonoCliente.trim() !== '') {
        const mensajeTexto = `¡Hola ${nombreCliente}! ✨ Te escribimos de *${nombreRestaurante}*.\nAquí tienes adjunta tu factura digital generada por *Zlipmenu*.`;

        // Llamamos al helper dinámico pasándole la memoria del archivo directamente
        enviarFacturaWhatsApp(
            restauranteId, 
            telefonoCliente, 
            mensajeTexto, 
            req.file.buffer, 
            req.file.originalname
        );
    } else {
        console.log('Falta el ID del restaurante o el teléfono para procesar el WhatsApp.');
    }

    // Respuesta rápida a Angular en Vercel
    return res.json({
        ok: true,
        message: 'La factura está siendo procesada por el bot del restaurante.'
    });
}

module.exports = {
    enviarFactura,
};