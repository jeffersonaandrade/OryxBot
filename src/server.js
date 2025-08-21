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
const { isHandoff, setHandoff } = require('./utils/handoff');
const { appendAudit } = require('./utils/audit');
const { shouldSendIntro, markIntroSent, setHandoffOffer, clearHandoffOffer, hasActiveHandoffOffer } = require('./utils/sessions');

const app = Fastify({ logger: true });
const rag = new RAGService();

const PORT = Number(process.env.PORT || 3000);
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_MODE = process.env.WHATSAPP_MODE || 'cloud'; // 'cloud' | 'web'

// Abstração de envio/leitura para suportar Cloud API e WhatsApp Web
let waSendText = sendTextMessage;
let waMarkRead = markMessageAsRead;
let waWebRef = null;
if (WHATSAPP_MODE === 'web') {
    try {
        waWebRef = require('./services/whatsapp-web');
        waWebRef.getClient();
        waSendText = waWebRef.sendTextMessage;
        waMarkRead = async () => {};
        app.log.info('WhatsApp mode: web');
    } catch (e) {
        app.log.error({ err: e }, 'Falha ao inicializar WhatsApp Web');
    }
} else {
    app.log.info('WhatsApp mode: cloud');
}

// No modo web, escutar mensagens diretas e ignorar grupos
if (WHATSAPP_MODE === 'web' && waWebRef && waWebRef.getClient) {
    const webClient = waWebRef.getClient();
    // Marca o instante a partir do qual mensagens serão consideradas (evita ler mensagens antigas)
    let waWebActiveSinceMs = Date.now();
    webClient.once('ready', () => {
        waWebActiveSinceMs = Date.now();
        appendAudit('wa_web_active_since', { atIso: new Date(waWebActiveSinceMs).toISOString() });
    });
    webClient.on('message', async (msg) => {
        try {
            const isGroup = Boolean(msg && msg.from && msg.from.endsWith('@g.us'));
            if (isGroup) {
                appendAudit('ignored_message', { reason: 'group_chat', from: msg.from });
                return;
            }
            // Ignora mensagens antigas, recebidas antes do cliente ficar ativo
            const tsMs = typeof msg.timestamp === 'number' ? msg.timestamp * 1000 : Date.now();
            if (waWebActiveSinceMs && tsMs < waWebActiveSinceMs) {
                appendAudit('ignored_message', { reason: 'before_activation', from: msg.from, tsMs, activeSinceMs: waWebActiveSinceMs });
                return;
            }
            if (msg && msg.type === 'chat') {
                const fromWaId = (msg.from || '').replace('@c.us', '');
                const userText = msg.body || '';
                if (!userText.trim()) return;
                await handleIncoming(fromWaId, userText, 'wa-web', { dryRun: false });
            } else {
                appendAudit('ignored_message', { reason: 'non_text', type: msg && msg.type });
            }
        } catch (err) {
            app.log.error({ err }, 'Erro ao processar mensagem (wa-web)');
        }
    });
}

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

// Função comum de processamento de mensagens (usada no webhook e no teste local)
async function handleIncoming(fromWaId, userText, toWaId, options) {
    const dryRun = Boolean(options && options.dryRun);
    appendAudit('incoming', { fromWaId, toWaId, userText, dryRun });

    // Regras de handoff humano
    const normalized = (userText || '').toLowerCase();
    const wantsHuman = [
        'atendente',
        'ser humano',
        'humano',
        'falar com atendente',
        'falar com humano',
        'atendimento humano',
    ].some((kw) => normalized.includes(kw));

    const wantsBotBack = [
        'retornar ao bot',
        'retornar bot',
        'voltar ao bot',
        'voltar pro bot',
        'retomar bot',
        'retomar atendimento automático',
        'menu',
    ].some((kw) => normalized.includes(kw));

    if (isHandoff(fromWaId)) {
        if (wantsBotBack) {
            setHandoff(fromWaId, false);
            const msg = 'Perfeito! Retomando o atendimento automático. Como posso ajudar?';
            if (!dryRun) await waSendText(fromWaId, msg);
            appendAudit('handoff_end', { fromWaId });
            appendInteraction({
                timestampIso: new Date().toISOString(),
                fromWaId,
                toWaId,
                userText,
                botText: msg,
            });
            return msg;
        }
        appendInteraction({
            timestampIso: new Date().toISOString(),
            fromWaId,
            toWaId,
            userText,
            botText: '[handoff:ativo]'
        });
        appendAudit('handoff_active', { fromWaId });
        return '[handoff:ativo]';
    }

    // Aceite/recusa de oferta recente de handoff (janela curta)
    if (hasActiveHandoffOffer(fromWaId)) {
        const accepts = [
            'sim', 'sim, por favor', 'pode ser', 'ok', 'okay', 'pode', 'aceito', 'quero', 'por favor'
        ].some((kw) => normalized === kw || normalized.startsWith(kw));
        const rejects = [
            'nao', 'não', 'depois', 'agora nao', 'agora não', 'obrigado', 'valeu', 'por enquanto não', 'por enquanto nao'
        ].some((kw) => normalized === kw || normalized.startsWith(kw));

        if (accepts) {
            clearHandoffOffer(fromWaId);
            setHandoff(fromWaId, true);
            const msg = 'Entendido! Vou transferir seu atendimento para um atendente humano. Em instantes alguém continuará a conversa. Se quiser voltar a falar com o assistente, envie: "retornar ao bot".';
            if (!dryRun) await waSendText(fromWaId, msg);
            appendInteraction({
                timestampIso: new Date().toISOString(),
                fromWaId,
                toWaId,
                userText,
                botText: '[handoff:ativado]'
            });
            appendAudit('handoff_start_by_accept', { fromWaId });
            return msg;
        }

        if (rejects) {
            clearHandoffOffer(fromWaId);
            appendAudit('handoff_offer_rejected', { fromWaId });
            // segue fluxo normal sem resposta adicional
        }
    }

    if (wantsHuman) {
        setHandoff(fromWaId, true);
        const msg = 'Entendido! Vou transferir seu atendimento para um atendente humano. Em instantes alguém continuará a conversa. Se quiser voltar a falar com o assistente, envie: "retornar ao bot".';
        if (!dryRun) await waSendText(fromWaId, msg);
        appendInteraction({
            timestampIso: new Date().toISOString(),
            fromWaId,
            toWaId,
            userText,
            botText: '[handoff:ativado]'
        });
        appendAudit('handoff_start', { fromWaId });
        return msg;
    }

    // Saudação e apresentação automática (somente fora de handoff)
    const greetingTerms = ['oi', 'olá', 'ola', 'hey', 'e aí', 'eaí', 'bom dia', 'boa tarde', 'boa noite'];
    const isGreeting = greetingTerms.some((kw) => normalized.startsWith(kw));
    if (isGreeting && shouldSendIntro(fromWaId)) {
        const intro = 'Olá! Você está falando com o assistente virtual da Oryx. Vou te ajudar por aqui.';
        if (!dryRun) await waSendText(fromWaId, intro);
        markIntroSent(fromWaId);
        appendAudit('intro_sent', { fromWaId });
    }

    const groq = createGroqClient();
    const systemPrompt = getSystemPrompt(process.env.AGENT_TONE);
    const { contextText, snippets } = rag.buildPromptContext(userText);
    const composedSystem =
        systemPrompt +
        (contextText ? `\n\n${contextText}\n\nRegras: Responda APENAS com base no contexto quando aplicável. Se faltar informação, diga que não sabe e ofereça encaminhar para um humano.` : '');

    const aiReply = await generateReply(groq, [
        { role: 'system', content: composedSystem },
        { role: 'user', content: userText }
    ]);

    const needsDisclaimer = !contextText || (Array.isArray(snippets) && snippets.length === 0);
    const finalReply = aiReply && aiReply.trim().length > 0
        ? (needsDisclaimer
            ? `${aiReply}\n\nObservação: esta resposta é geral e pode não refletir políticas específicas da Oryx. Recomendo confirmar com um atendente humano.`
            : aiReply)
        : '';

    // Se a IA sugeriu encaminhar para humano, registrar oferta por 1h
    try {
        const low = String(aiReply || '').toLowerCase();
        const suggestsHandoff = /encaminhar|transferir/.test(low) && /(atendente|humano)/.test(low);
        if (suggestsHandoff) {
            setHandoffOffer(fromWaId);
            appendAudit('handoff_offer_set', { fromWaId });
        }
    } catch (_) {}

    if (finalReply) {
        if (!dryRun) await waSendText(fromWaId, finalReply);
    }

    appendInteraction({
        timestampIso: new Date().toISOString(),
        fromWaId,
        toWaId,
        userText,
        botText: finalReply || ''
    });

    appendAudit('bot_reply', { fromWaId, toWaId, userText, aiReply: finalReply });

    return finalReply || '';
}

// Endpoint de teste local que simula o webhook sem chamar a API do WhatsApp
app.post('/webhook-test', async (request) => {
    const { from, text } = request.body || {};
    const fromWaId = String(from || '5511999999999');
    const userText = String(text || '').trim();
    if (!userText) return { reply: '' };
    const reply = await handleIncoming(fromWaId, userText, 'local', { dryRun: true });
    return { reply };
});

// Endpoints de status/QR do WhatsApp Web
app.get('/wa-web/status', async () => {
    if (WHATSAPP_MODE !== 'web') return { mode: WHATSAPP_MODE };
    const status = waWebRef ? waWebRef.getStatus() : { ready: false, authenticated: false, hasQr: false };
    return { mode: 'web', ...status };
});

app.get('/wa-web/qr', async (request, reply) => {
    if (WHATSAPP_MODE !== 'web') return { mode: WHATSAPP_MODE };
    const qr = waWebRef && waWebRef.popQr ? waWebRef.popQr() : null;
    if (!qr) return { qr: null };
    // Retorna o texto QR para ser renderizado em outro client (ou use terminal)
    return { qr };
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
            appendAudit('webhook_ignored', { reason: 'no_body_or_entry' });
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
                        appendAudit('ignored_message', { reason: 'non_text', messageType: message.type });
                        continue;
                    }

                    const fromWaId = message.from; // ex: 55XXXXXXXXXXX
                    const userText = message.text && message.text.body ? message.text.body : '';
                    const toWaId = metadata.display_phone_number || '';

                    try {
                        // Marca como lida (opcional) apenas no modo cloud
                        if (message.id && WHATSAPP_MODE === 'cloud') {
                            waMarkRead(message.id).catch(() => {});
                        }
                        await handleIncoming(fromWaId, userText, toWaId, { dryRun: false });
                    } catch (err) {
                        app.log.error({ err }, 'Erro ao processar mensagem');
                        appendAudit('webhook_error', { message: err && err.message });
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


