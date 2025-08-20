'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const Fastify = require('fastify');
const { createGroqClient, generateReply } = require('./services/groq');
const { getSystemPrompt } = require('./agent/prompt');
const { RAGService } = require('./knowledge/rag');
const { sendTextMessage, markMessageAsRead } = require('./services/whatsapp');
const { appendInteraction } = require('./utils/csv');

const app = Fastify({ logger: true });
const rag = new RAGService();

const PORT = Number(process.env.PORT || 3000);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';

// Healthcheck
app.get('/', async () => ({ ok: true }));

// Endpoint de chat para testes sem WhatsApp
app.post('/chat', async (request) => {
    const { message } = request.body || {};
    const userText = String(message || '').trim();
    if (!userText) return { reply: '', usedSnippets: [] };

    const systemPrompt = getSystemPrompt(process.env.AGENT_TONE);
    const { contextText, snippets } = rag.buildPromptContext(userText);

    const groq = createGroqClient();
    const aiReply = await generateReply(groq, [
        { role: 'system', content: systemPrompt + '\n\n' + (contextText || '') + (contextText ? '\n\nRegras: Responda APENAS com base no contexto quando aplicável. Se faltar informação, diga que não sabe e ofereça encaminhar para um humano.' : '') },
        { role: 'user', content: userText }
    ]);

    return { reply: aiReply || '', usedSnippets: snippets };
});

// Verificação do Webhook (GET)
app.get('/webhook', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return reply.code(200).send(challenge);
    }
    return reply.code(403).send('Forbidden');
});

// Recebimento de mensagens (POST)
app.post('/webhook', async (request, reply) => {
    try {
        const body = request.body;

        if (!body || !body.entry) {
            reply.code(400).send({ status: 'ignored' });
            return;
        }

        // Responde imediatamente para não estourar timeout do Meta
        reply.code(200).send({ status: 'received' });

        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value || {};
                const messages = value.messages || [];
                const metadata = value.metadata || {};

                for (const message of messages) {
                    // Processa apenas mensagens de texto
                    if (message.type !== 'text') {
                        continue;
                    }

                    const fromWaId = message.from; // ex: 55XXXXXXXXXXX
                    const userText = message.text && message.text.body ? message.text.body : '';
                    const toWaId = metadata.display_phone_number || '';

                    try {
                        // Marca como lida (opcional)
                        if (message.id) {
                            markMessageAsRead(message.id).catch(() => {});
                        }

                        const groq = createGroqClient();
                        const systemPrompt = getSystemPrompt(process.env.AGENT_TONE);
                        const { contextText } = rag.buildPromptContext(userText);
                        const composedSystem =
                            systemPrompt +
                            (contextText ? `\n\n${contextText}\n\nRegras: Responda APENAS com base no contexto quando aplicável. Se faltar informação, diga que não sabe e ofereça encaminhar para um humano.` : '');

                        const aiReply = await generateReply(groq, [
                            { role: 'system', content: composedSystem },
                            { role: 'user', content: userText }
                        ]);

                        if (aiReply && aiReply.trim().length > 0) {
                            await sendTextMessage(fromWaId, aiReply);
                        }

                        // Log em CSV
                        appendInteraction({
                            timestampIso: new Date().toISOString(),
                            fromWaId,
                            toWaId,
                            userText,
                            botText: aiReply || ''
                        });
                    } catch (err) {
                        app.log.error({ err }, 'Erro ao processar mensagem');
                    }
                }
            }
        }
    } catch (err) {
        request.log.error({ err }, 'Erro no webhook');
        // Meta exige 200 OK mesmo em erro na lógica interna (já respondemos acima quando possível)
        try { reply.code(200).send({ status: 'received' }); } catch (_) {}
    }
});

// Inicializa servidor
const start = async () => {
    try {
        // Garante que diretório de dados exista
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Carrega conhecimento (FAQ) para RAG leve
        try {
            const { numDocs } = rag.load();
            app.log.info(`RAG carregado com ${numDocs} chunks`);
        } catch (e) {
            app.log.warn({ err: e }, 'Falha ao carregar RAG (seguindo sem contexto)');
        }

        await app.listen({ port: PORT, host: '0.0.0.0' });
        app.log.info(`Servidor iniciado na porta ${PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();


