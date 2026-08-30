const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

let latestQR = '';

// Ruta web para ver el QR en grande desde cualquier navegador
app.get('/', async (req, res) => {
    if (!latestQR) {
        return res.send('<h1>El bot aún está generando el código QR o ya está conectado. Recarga la página en unos segundos...</h1>');
    }
    try {
        const urlImage = await qrcode.toDataURL(latestQR);
        res.send(`
            <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
                <h1>Escanea este QR con WhatsApp</h1>
                <p>Abre WhatsApp en tu celular > Dispositivos vinculados > Vincular un dispositivo</p>
                <img src="${urlImage}" alt="QR WhatsApp" style="width: 350px; height: 350px; border: 2px solid #ccc; border-radius: 10px; padding: 10px;" />
            </div>
        `);
    } catch (err) {
        res.status(500).send('Error generando la imagen del QR');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

// CONFIGURACIÓN DE PUPPETEER PARA LA NUBE
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.CHROME_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    latestQR = qr;
    console.log('Nuevo QR generado. Entra a la URL pública de tu app en Railway para escanearlo.');
});

client.on('ready', () => {
    console.log('¡El bot está listo y conectado a WhatsApp!');
    latestQR = ''; // Limpiamos el QR una vez conectado
});

// Eventos de mensajes
client.on('message', async msg => {
    const textoMensaje = msg.body.toLowerCase();
    console.log(`Mensaje recibido: ${textoMensaje}`);
    
    if (textoMensaje.includes('bot')) {
        await msg.reply('¡Hola! Soy el bot de la panadería.');
    }
});

client.initialize();
