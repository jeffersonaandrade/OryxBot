'use strict';

const axios = require('axios');

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

function getBaseUrl() {
    if (!WHATSAPP_PHONE_NUMBER_ID) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID não configurado');
    }
    return `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}`;
}

async function sendTextMessage(toWaId, text) {
    if (!WHATSAPP_ACCESS_TOKEN) {
        throw new Error('WHATSAPP_ACCESS_TOKEN não configurado');
    }

    const url = `${getBaseUrl()}/messages`;
    const payload = {
        messaging_product: 'whatsapp',
        to: toWaId,
        type: 'text',
        text: { body: text },
    };

    await axios.post(url, payload, {
        headers: {
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

async function markMessageAsRead(messageId) {
    if (!WHATSAPP_ACCESS_TOKEN) {
        throw new Error('WHATSAPP_ACCESS_TOKEN não configurado');
    }
    const url = `${getBaseUrl()}/messages`;
    const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
    };

    await axios.post(url, payload, {
        headers: {
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

module.exports = {
    sendTextMessage,
    markMessageAsRead,
};


