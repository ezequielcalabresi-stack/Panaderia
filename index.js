const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const axios = require('axios');
const { validarPermisoUsuario } = require('./authMiddleware');

const app = express();
app.use(bodyParser.json());

// Inicialización de Firebase con tu base de datos en la nube
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://panaderia-sync-281a5-default-rtdb.firebaseio.com"
});

const db = admin.database();

// 1. Verificación del Webhook de Meta (GET)
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "panaderia123"; 

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook principal que recibe los mensajes de WhatsApp (POST)
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200); 
    }

    const telefonoRemitente = message.from; 
    const textoMensaje = message.text?.body?.trim() || "";

    console.log(`Mensaje recibido de ${telefonoRemitente}: "${textoMensaje}"`);

    let respuestaBot = "";

    if (textoMensaje.toLowerCase().startsWith('saldo')) {
      const nombreBuscado = textoMensaje.replace(/saldo/i, '').trim();
      
      const validacion = await validarPermisoUsuario(db, telefonoRemitente, 'consultar_saldo');
      if (!validacion.autorizado) {
        return enviarRespuestaWhatsApp(telefonoRemitente, validacion.mensaje);
      }

      const saldo = await calcularSaldoClienteFirebase(nombreBuscado);
      respuestaBot = `El saldo actual de *${nombreBuscado}* es: *$${saldo.toLocaleString()}*`;

    } else if (textoMensaje.toLowerCase().startsWith('direccion')) {
      const nombreBuscado = textoMensaje.replace(/direccion/i, '').trim();
      
      const validacion = await validarPermisoUsuario(db, telefonoRemitente, 'ver_direccion');
      if (!validacion.autorizado) {
        return enviarRespuestaWhatsApp(telefonoRemitente, validacion.mensaje);
      }

      const direccion = await buscarDireccionClienteFirebase(nombreBuscado);
      respuestaBot = `La dirección de *${nombreBuscado}* es: ${direccion}`;

    } else if (textoMensaje.toLowerCase().startsWith('pagado')) {
      const partes = textoMensaje.replace(/pagado/i, '').trim().split(' ');
      const montoPago = parseFloat(partes.pop()) || 0;
      const nombreBuscado = partes.join(' ');

      const validacion = await validarPermisoUsuario(db, telefonoRemitente, 'registrar_pago');
      if (!validacion.autorizado) {
        return enviarRespuestaWhatsApp(telefonoRemitente, validacion.mensaje);
      }

      const resultado = await registrarPagoClienteFirebase(nombreBuscado, montoPago);
      respuestaBot = resultado;

    } else {
      respuestaBot = "🤖 Hola! No reconocí ese comando. Probá con:\n• *saldo [nombre]*\n• *direccion [nombre]*\n• *pagado [nombre] [monto]*";
    }

    await enviarRespuestaWhatsApp(telefonoRemitente, respuestaBot);
    res.sendStatus(200);

  } catch (error) {
    console.error("Error en webhook:", error);
    res.sendStatus(500);
  }
});

// --- FUNCIONES AUXILIARES ---

async function calcularSaldoClienteFirebase(nombreCliente) {
  const clientesSnap = await db.ref('db_clientes').once('value');
  const clientes = clientesSnap.val() || {};
  
  let clienteId = null;
  Object.keys(clientes).forEach(id => {
    if (clientes[id].nombre.toLowerCase().includes(nombreCliente.toLowerCase())) {
      clienteId = id;
    }
  });

  if (!clienteId) return "Cliente no encontrado en la base de datos.";

  let saldo = 0;
  const repartosSnap = await db.ref('db_repartos').once('value');
  const repartos = repartosSnap.val() || {};

  Object.values(repartos).forEach(pDia => {
    const pArr = Array.isArray(pDia) ? pDia : Object.values(pDia);
    pArr.forEach(p => {
      if (p && p.clienteId === clienteId && !p.pagado) {
        saldo += (p.monto || 0);
      }
    });
  });

  return saldo;
}

async function buscarDireccionClienteFirebase(nombreCliente) {
  const clientesSnap = await db.ref('db_clientes').once('value');
  const clientes = clientesSnap.val() || {};
  
  let direccion = "Dirección no registrada";
  Object.values(clientes).forEach(c => {
    if (c && c.nombre && c.nombre.toLowerCase().includes(nombreCliente.toLowerCase())) {
      direccion = c.direccion || "Sin dirección especificada";
    }
  });

  return direccion;
}

async function registrarPagoClienteFirebase(nombreCliente, monto) {
  const clientesSnap = await db.ref('db_clientes').once('value');
  const clientes = clientesSnap.val() || {};
  
  let clienteId = null;
  Object.keys(clientes).forEach(id => {
    if (clientes[id].nombre.toLowerCase().includes(nombreCliente.toLowerCase())) {
      clienteId = id;
    }
  });

  if (!clienteId) return "No se pudo registrar el pago: Cliente no encontrado.";
  if (monto <= 0) return "El monto del pago debe ser mayor a 0.";

  const nuevoPago = {
    id: 'PAG-BOT-' + Date.now(),
    fecha: new Date().toISOString().split('T')[0],
    monto: monto,
    medio: 'Efectivo (Bot WhatsApp)',
    tipo: 'credito'
  };

  await db.ref(`db_historial_clientes/${clienteId}`).push(nuevoPago);

  return `✅ ¡Pago de $${monto.toLocaleString()} registrado con éxito para ${nombreCliente}!`;
}

async function enviarRespuestaWhatsApp(telefono, texto) {
  try {
    const TOKEN_ACCESSO_META = "EAAj2xAzxAskBSQEuVYzrj9P0kBlolvw9jtHde1zih3I6dnSavUgUZBQSyLFIiKdUBBXt5UAr6dT3hTylMnDWHEQnZCXcbpgzLeUMW6WkEgSGdy2Ho5INwd3Nx0d4Y4bfhoPKgiwdi1bC81EhrZAJZAhEwAWNZCp3uvwKjKFH03Bp5nk33QjqIpfApBTbUXZAEvgJtvDncl9GZAJr0C4iYGu7ehSfQjtigeVGjRjYkiuZBPrio0pZCYxu1ZAQJiYggSZA9MYE5t1wOwooWYqA7MW5hkZB";
    const PHONE_NUMBER_ID = "1251187448084396"; 

    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: telefono,
        text: { body: texto },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN_ACCESSO_META}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`[WHATSAPP ENVIADO] A ${telefono}: ${texto}`);
  } catch (error) {
    console.error("Error al enviar mensaje por WhatsApp:", error.response?.data || error.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor del bot corriendo en el puerto ${PORT}`);
});
