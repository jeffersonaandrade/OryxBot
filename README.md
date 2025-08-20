## OryxBot — Desenvolvimento (Fastify + WhatsApp Cloud API + Groq)

Guia conciso para rodar em desenvolvimento, configurar o webhook e entender a estrutura do projeto.

## Requisitos
- Node.js 18+ e npm
- Conta no WhatsApp Cloud API (Meta) com número ativo
- Chave da Groq (começa com `gsk_`)

## Instalação
```bash
npm install
```

Se aparecer erro de `nodemon` não reconhecido ao rodar em dev, instale o dev dep:
```bash
npm i -D nodemon
```

## Variáveis de ambiente (`.env` na raiz)
Crie um arquivo `.env` com:
```bash
PORT=3000

# WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=coloque-um-token-forte
WHATSAPP_ACCESS_TOKEN=EAA... (token do painel)
WHATSAPP_PHONE_NUMBER_ID=1234567890 (ID numérico do número, não é o +55...)

# Groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=compound-beta-mini # ou compound-beta (verifique modelos ativos no painel da Groq)
AGENT_TONE=profissional # ou: exclusivo | acessivel
RAG_TOP_K=3
RAG_CHUNK_SIZE=800
RAG_CHUNK_OVERLAP=120
```
- `WHATSAPP_VERIFY_TOKEN`: segredo que você escolhe e repete no painel durante a verificação do webhook.
- `WHATSAPP_ACCESS_TOKEN`: token do painel do WhatsApp Cloud (atenção a expiração).
- `WHATSAPP_PHONE_NUMBER_ID`: “Identificação do número de telefone” (valor numérico longo do painel).

## Executando em desenvolvimento
```bash
npm run dev
```
Healthcheck local: abra `http://localhost:3000/` e verifique `{ ok: true }`.

## Expondo via túnel (apenas para desenvolvimento)
Abra um túnel para obter uma URL pública (temporária):
```bash
npx localtunnel --port 3000
```
Opcional: tente reservar um subdomínio (sem garantia de disponibilidade):
```bash
npx localtunnel --port 3000 --subdomain oryxbot
```
Observações:
- O túnel fecha ao encerrar o processo (Ctrl+C), fechar o terminal, queda de rede ou inatividade.
- A URL é temporária; para produção use domínio fixo (deploy em cloud, ngrok com domínio reservado ou Cloudflare Tunnel).

## Configurando o Webhook no WhatsApp Cloud API
No painel do Meta (WhatsApp → Configuração → Webhooks):
1. Callback URL: `https://SUA-URL-PUBLICA/webhook`
2. Verify token: use exatamente o valor de `WHATSAPP_VERIFY_TOKEN` do `.env`
3. Clique em “Verificar e salvar”
4. Em “Gerenciar” (Manage), marque o tópico “messages” e salve

Validação manual (opcional):
```
https://SUA-URL-PUBLICA/webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123
```
Se tudo certo, retorna `123`.

## Testes rápidos
- Envio proativo (sem webhook), substitua valores reais:
```bash
curl -X POST "https://graph.facebook.com/v20.0/SEU_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer SEU_WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "55DDDNUMERO",
    "type": "text",
    "text": { "body": "Teste de envio via API" }
  }'
```
- Fim a fim (com webhook): envie mensagem para o número da Cloud API. O bot responde via Groq e registra em `data/interactions.csv`.

### Teste de chat sem WhatsApp (endpoint local)
Envie uma mensagem e receba a resposta usando o FAQ como contexto:
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Como funciona a liquidez dos fundos?"}'
```
Resposta esperada:
```json
{ "reply": "...", "usedSnippets": [ { "file": "...", "content": "..." } ] }
```

## Estrutura do projeto
```
src/
  server.js               # Servidor Fastify, rotas do webhook e orquestração
  services/
    groq.js               # Cliente e geração de resposta via Groq
    whatsapp.js           # Envio de mensagens e marcação como lida na Cloud API
  knowledge/
    rag.js               # RAG leve (BM25 via MiniSearch): load, search e contexto
  utils/
    csv.js                # Registro de interações em CSV (data/interactions.csv)
knowledge/
  faq/                    # Coloque seus arquivos .md/.txt de FAQ aqui
data/
  interactions.csv        # Gerado em runtime
```

### Endpoints
- `GET /` → healthcheck
- `GET /webhook` → verificação do webhook (usa `WHATSAPP_VERIFY_TOKEN`)
- `POST /webhook` → recepção de mensagens do WhatsApp; chama Groq e responde
- `POST /chat` → teste local sem WhatsApp; usa RAG e retorna `{ reply, usedSnippets }`

## Personalização do agente (tom e políticas)
Agora o tom é configurável via `.env` em `AGENT_TONE`:
- `profissional` (Profissional e Consultivo)
- `exclusivo` (Exclusivo e Sofisticado)
- `acessivel` (Acessível e Educativo)

O texto do “system prompt” é gerado por `src/agent/prompt.js`. Para ajustes finos, edite esse arquivo.

## RAG (documentos e respostas mais precisas)
Para docs maiores, use um fluxo de RAG local:
1. Coloque arquivos em uma pasta `knowledge/` (`.md`, `.pdf`, `.docx` etc.)
2. Rode um indexador (split + embeddings) e salve um índice local (ex.: JSON/SQLite)
3. Antes de chamar a Groq, busque top‑K trechos relevantes e injete no prompt

Sugestão (Node.js): usar `@xenova/transformers` para embeddings locais e um índice simples. Podemos incluir esse pipeline depois, mantendo o envio normal para a Groq.

## Dicas e problemas comuns
- `nodemon` não reconhecido: `npm i -D nodemon`
- `WHATSAPP_PHONE_NUMBER_ID` é o ID numérico do número (do painel), não o `+55...`
- Token de acesso expira: gere tokens de sistema de longa duração para produção
- Sem webhook você não recebe mensagens; webhook é obrigatório para “ouvir” os eventos

## Produção (visão geral)
- Use domínio fixo com HTTPS (ex.: `https://bot.suaempresa.com/webhook`)
- Atualize a Callback URL no painel do WhatsApp para a URL definitiva
- Mantenha `process.env.PORT` para compatibilidade com providers
- Rotacione tokens e mantenha logs de erros


