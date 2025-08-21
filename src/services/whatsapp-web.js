'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Estado interno simples para expor via endpoints
let lastQr = null; // string QR atual
let isReady = false;
let isAuthenticated = false;
let client = null;
// Evitar logs repetidos
let logged = { qr: false, auth: false, ready: false, disc: false };

function getClient() {
    if (client) return client;

    const waClient = new Client({
        authStrategy: new LocalAuth({ clientId: 'oryxbot' }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        }
    });

    waClient.on('qr', (qr) => {
        lastQr = qr;
        if (!logged.qr) {
            console.log('[WA-Web] QR recebido. Escaneie com o app do WhatsApp.');
            logged.qr = true;
        }
        qrcode.generate(qr, { small: true });
    });

    waClient.on('authenticated', () => {
        isAuthenticated = true;
        if (!logged.auth) {
            console.log('[WA-Web] Autenticado com sucesso.');
            logged.auth = true;
        }
    });

    waClient.on('auth_failure', () => {
        isAuthenticated = false;
        if (!logged.auth) {
            console.error('[WA-Web] Falha de autenticação.');
            logged.auth = true;
        }
    });

    waClient.on('ready', () => {
        isReady = true;
        if (!logged.ready) {
            console.log('[WA-Web] Cliente pronto e conectado.');
            logged.ready = true;
        }
    });

    waClient.on('disconnected', (reason) => {
        isReady = false;
        isAuthenticated = false;
        if (!logged.disc) {
            console.warn('[WA-Web] Desconectado:', reason);
            logged.disc = true;
        }
    });

    waClient.initialize();
    client = waClient;
    return client;
}

async function sendTextMessage(toWaId, text) {
    const c = getClient();
    if (!isReady) throw new Error('WhatsApp Web client não está pronto');
    const jid = toWaId.endsWith('@c.us') ? toWaId : `${toWaId}@c.us`;
    await c.sendMessage(jid, text);
}

function getStatus() {
    return {
        ready: isReady,
        authenticated: isAuthenticated,
        hasQr: Boolean(lastQr),
    };
}

function popQr() {
    // Não invalida imediatamente para permitir múltiplas leituras
    return lastQr;
}

module.exports = {
    getClient,
    sendTextMessage,
    getStatus,
    popQr,
};


