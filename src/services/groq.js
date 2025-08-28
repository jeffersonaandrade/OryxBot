'use strict';

const Groq = require('groq-sdk');

function createGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY não encontrado no ambiente');
    }
    return new Groq({ apiKey });
}

async function generateReply(groqClient, messages) {
    const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
    const response = await groqClient.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 250, // Otimizado para economia
    });
    const choice = response && response.choices && response.choices[0];
    const content = choice && choice.message && choice.message.content;
    return content || '';
}

module.exports = {
    createGroqClient,
    generateReply,
};


