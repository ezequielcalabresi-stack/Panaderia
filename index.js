// Verificación del Webhook de Meta (GET)
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "panaderia123"; // Debe coincidir exactamente con el token que pusiste en Meta

 const mode = req.query['hub.mode'];
const token = req.query['hub.verify_token']; // <--- Acá estaba el error, debe leer 'hub.verify_token'
const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { validarPermisoUsuario } = require('./authMiddleware');

const app = express();
app.use(bodyParser.json());

// Inicialización de Firebase con tu base de datos en la nube
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://panaderia-sync-281a5-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Webhook principal que recibe los mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    
    // Extracción de datos del mensaje entrante (formato estándar de WhatsApp Cloud API)
    const entry = data.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200); // Si es un reporte de entrega u otro evento, se ignora
    }

    const telefonoRemitente = message.from; // Ej: "5492346..."
    const textoMensaje = message.text?.body?.trim() || "";

    console.log(`Mensaje recibido de ${telefonoRemitente}: "${textoMensaje}"`);

    // Procesamiento de Comandos Básicos por Lenguaje Natural
    let respuestaBot = "";

    // 1. COMANDO: SALDO (Ej: "saldo Juan")
    if (textoMensaje.toLowerCase().startsWith('saldo')) {
      const nombreBuscado = textoMensaje.replace(/saldo/i, '').trim();
      
      // Validación de Permisos: Se requiere rol con acceso a consultar saldo
      const validacion = await validarPermisoUsuario(db, telefonoRemitente, 'consultar_saldo');
      if (!validacion.autorizado) {
        return enviarRespuestaWhatsApp(telefonoRemitente, validacion.mensaje);
      }

      const saldo = await calcularSaldoClienteFirebase(nombreBuscado);
      respuestaBot = `El saldo actual de *${nombreBuscado}* es: *$${saldo.toLocaleString()}*`;

    } 
    // 2. COMANDO: DIRECCIÓN (Ej: "direccion Juan")
    else if (textoMensaje.toLowerCase().startsWith('direccion')) {
      const nombreBuscado = textoMensaje.replace(/direccion/i, '').trim();
      
      const validacion = await validarPermisoUsuario(db, telefonoRemitente, 'ver_direccion');
      if (!validacion.autorizado) {
        return enviarRespuestaWhatsApp(telefonoRemitente, validacion.mensaje);
      }

      const direccion = await buscarDireccionClienteFirebase(nombreBuscado);
      respuestaBot = `La dirección de *${nombreBuscado}* es: ${direccion}`;

    } 
    // 3. COMANDO: MARCAR PAGADO / REGISTRAR PAGO (Ej: "pagado Juan 5000")
    else if (textoMensaje.toLowerCase().startsWith('pagado')) {
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

// --- FUNCIONES AUXILIARES DE CONSULTA Y ESCRITURA EN FIREBASE ---

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

  // Inyectar pago de crédito en el historial del cliente en Firebase
  const nuevoPago = {
    id: 'PAG-BOT-' + Date.now(),
    fecha: new Date().toISOString().split('T')[0],
    monto: monto,
    medio: 'Efectivo (Bot WhatsApp)',
    tipo: 'credito'
  };

  await db.ref(`db_historial_clientes/${clienteId}`).push(nuevoPago);

  return `✅ ¡Pago de $${monto.toLocaleString()} registrado con éxito para ${nombreCliente}! Se sincronizó con la cuenta corriente.`;
}

async function enviarRespuestaWhatsApp(telefono, texto) {
  // Aquí se integraría la llamada a la API de Meta para enviar el mensaje de vuelta
  console.log(`[WHATSAPP OUT] A ${telefono}: ${texto}`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor del bot corriendo en el puerto ${PORT}`);
});
