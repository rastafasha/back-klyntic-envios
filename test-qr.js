const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('Iniciando cliente usando Google Chrome de macOS...');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Cambia a false si quieres ver físicamente cómo se abre la ventana de Chrome
        // FUERZA A USAR TU NAVEGADOR INSTALADO EN MAC:
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('¡ÉXITO! Código QR detectado:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡El cliente está listo!');
});

client.on('auth_failure', (msg) => {
    console.error('Error en autenticación:', msg);
});

client.initialize();
