const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Bot de la panadería activo en la nube 🚀');
});

app.listen(PORT, () => {
    console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

// CONFIGURACIÓN CLAVE PARA LA NUBE (Render)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('Escanea este código QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡El bot está listo y conectado a WhatsApp!');
});

// El resto de tus eventos de mensajes (saldo, bot, etc.) van acá abajo...
client.on('message', async msg => {
    const textoMensaje = msg.body.toLowerCase();
    console.log(`Mensaje recibido: ${textoMensaje}`);
    
    if (textoMensaje.includes('bot')) {
        await msg.reply('¡Hola! Soy el bot de la panadería.');
    }
});

client.initialize();
