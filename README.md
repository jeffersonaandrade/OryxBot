## OryxBot — Desenvolvimento (Fastify + WhatsApp Cloud API + WhatsApp Web + Groq)

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

# Modo de operação do WhatsApp
WHATSAPP_MODE=cloud # ou web

# WhatsApp Cloud API (usado quando WHATSAPP_MODE=cloud)
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

### Interface Web para QR Code
Acesse `http://localhost:3000/qr` para uma interface moderna de conexão do WhatsApp Web:
- ✅ **Interface responsiva** com Tailwind CSS
- ✅ **Status em tempo real** da conexão
- ✅ **QR Code visual** para escaneamento
- ✅ **Instruções passo a passo** 
- ✅ **Detecção automática** de conexão estabelecida

### Modo WhatsApp Web (v1)
- Requisitos: navegador headless via Puppeteer (instalado automaticamente). Em Windows pode aparecer um prompt para instalar/atualizar o Chrome headless.
- Primeiro uso: ao iniciar com `WHATSAPP_MODE=web`, o terminal exibirá um QR (ASCII). Escaneie com o WhatsApp do número desejado.
- Endpoints auxiliares:
  - `GET /wa-web/status` → `{ mode, ready, authenticated, hasQr }`
  - `GET /wa-web/qr` → `{ qr }` com o texto do QR atual (para renderizar em outro app)
  
Notas:
- O `session` é salvo automaticamente (LocalAuth) em uma pasta `.wwebjs_auth/`. Em reexecuções, não será preciso escanear novamente.
- Para trocar de número, apague a pasta `.wwebjs_auth/oryxbot` com o serviço parado.
- Mantenha `.wwebjs_auth/`, `data/*.json` e `data/*.jsonl` no `.gitignore` para evitar comitar sessões e dados sensíveis.

#### Comportamento (modo WhatsApp Web)
- Apenas DMs: mensagens de grupos (`@g.us`) são ignoradas.
- Mensagens antigas: somente mensagens com timestamp posterior ao momento em que o cliente fica pronto (evento `ready`) são processadas. Mensagens anteriores são ignoradas.
- Apresentação do bot em saudações: para mensagens como "oi", "olá/ola", "hey", "e aí/eaí", "bom dia/boa tarde/boa noite", o bot envia uma apresentação (“Olá! Você está falando com o assistente virtual da Oryx. Vou te ajudar por aqui.”) no máximo 1 vez a cada 24h por contato. Não dispara se o contato estiver em handoff.
- Handoff humano facilitado: se o bot sugerir falar com um humano, por até 1h respostas como “sim”, “ok”, “pode ser” ativam automaticamente o handoff. Respostas como “não”, “depois” cancelam a oferta. "retornar ao bot" desativa o handoff.
- Sem contexto RAG: quando não houver trechos relevantes nas docs (`knowledge/faq`), a resposta inclui um aviso para confirmar com um atendente humano.
- Logs do WhatsApp Web: eventos de QR, autenticado, cliente pronto e desconectado são logados apenas uma vez por execução (anti-spam de logs).

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
    whatsapp-web.js       # Cliente whatsapp-web.js, QR/status e envio no modo web
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
- `GET /qr` → interface web moderna para conexão WhatsApp Web
- `GET /wa-web/status` → status da conexão WhatsApp Web (JSON)
- `GET /wa-web/qr` → QR Code atual (JSON)
- `GET /webhook` → verificação do webhook (usa `WHATSAPP_VERIFY_TOKEN`)
- `POST /webhook` → recepção de mensagens do WhatsApp; chama Groq e responde
- `POST /chat` → teste local sem WhatsApp; usa RAG e retorna `{ reply, usedSnippets }`
- `POST /webhook-test` → simulação de webhook para testes locais

## Handoff humano (transferência para atendente)
O bot possui um modo de "atendimento humano" por contato. Quando ativado, o bot deixa de responder com IA para aquele número e apenas informa que o atendimento está com um humano, explicando como voltar ao assistente.

Onde fica a lógica
- `src/utils/handoff.js` → persistência simples em `data/handoff.json` por `fromWaId` (telefone do cliente)
- `src/server.js` → desvio de fluxo no webhook e no endpoint de teste

Como ativar (palavras‑chave, sem acento/maiúsculas importam menos)
- "atendente", "ser humano", "humano", "falar com atendente", "falar com humano", "atendimento humano"

Como desativar (voltar ao bot)
- Envie: "retornar ao bot" (também aceitos: "voltar ao bot", "retomar bot", "menu")

Comportamento
- Ao ativar: registra `handoff:ativado` e envia UMA mensagem confirmando a transferência para um atendente humano, incluindo a instrução para voltar: "retornar ao bot".
- Enquanto ativo: novas mensagens do cliente NÃO passam pela IA e NÃO há lembretes automáticos. O bot só volta a responder quando o cliente escrever a palavra de retorno.
- Ao desativar (cliente envia "retornar ao bot"): envia confirmação e volta a responder normalmente com IA.
- Persistência: o estado fica salvo em `data/handoff.json` até o cliente enviar a palavra de retorno ou o arquivo ser limpo manualmente.

Testes sem WhatsApp (local)
- Simula o webhook sem chamar a API do WhatsApp:
```
POST http://localhost:3000/webhook-test
Body JSON: { "from": "5511999999999", "text": "Quero falar com um atendente" }
```
- Retornar ao bot:
```
POST http://localhost:3000/webhook-test
Body JSON: { "from": "5511999999999", "text": "retornar ao bot" }
```

Observações
- Apenas mensagens de texto disparam o fluxo.
- Não existe lembrete periódico; somente a mensagem única de ativação.
- Logs continuam em `data/interactions.csv` com marcadores `[handoff:ativado]`/`[handoff:ativo]`.

## Guia rápido: abrir túnel e configurar o webhook (desenvolvimento)
1) Iniciar o servidor
```bash
npm run dev
```

2) Abrir o túnel (Windows/PowerShell sugerido)
```powershell
npx --yes localtunnel --port 3000 | Tee-Object -FilePath lt.log
```
– A URL pública aparecerá no console e/ou em `lt.log` como `your url is: https://...loca.lt`.

3) Configurar o webhook no App (developers.facebook.com → seu App → WhatsApp → Webhooks)
- Callback URL: `https://SUA-URL-PUBLICA/webhook` (por ex.: `https://xxxx.loca.lt/webhook`)
- Verify token: o mesmo de `WHATSAPP_VERIFY_TOKEN` no `.env`
- Clique em “Verificar e salvar”
- Em “Gerenciar”, marque o campo `messages`

4) Validar manualmente
Abra no navegador (troque pelos seus valores):
```
https://SUA-URL-PUBLICA/webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123
```
Se tudo certo, retorna `123`.

5) Permissões do App
- Em “Desenvolvimento”, somente pessoas com função no App (admin/dev/tester) recebem eventos.
- Alternativas: adicionar seu usuário como Tester (e aceitar o convite) ou colocar o App “Ao vivo”.

6) Testar fim a fim
- Envie uma MENSAGEM DE TEXTO do seu WhatsApp para o número real conectado à Cloud API.
- Acompanhe os logs:
```powershell
# Auditoria detalhada
Get-Content .\data\audit.jsonl -Wait -Tail 50

# Resumo de conversas
Get-Content .\data\interactions.csv -Wait -Tail 50

# Auditoria (somente erros)
Get-Content .\data\audit.jsonl -Wait -Tail 50
```

7) Quando o túnel cair
- Reabra o túnel (passo 2) e atualize a Callback URL com a nova `https://...loca.lt/webhook`.

8) Teste local sem WhatsApp (opcional)
- Use `POST /webhook-test` para simular uma entrada:
```bash
curl -X POST http://localhost:3000/webhook-test \
  -H "Content-Type: application/json" \
  -d '{"from":"5511999999999","text":"ping"}'
```

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

## Melhorias Implementadas

### Interface Web QR Code
- **Interface moderna** com Tailwind CSS e design responsivo
- **Status em tempo real** com ícones e cores intuitivas  
- **QR Code otimizado** usando biblioteca qrcode-generator
- **Prevenção de regeneração** desnecessária com cache inteligente
- **Instruções visuais** passo a passo para conexão
- **Detecção automática** de WhatsApp conectado

### Otimizações de Performance
- **Controle de chamadas** evita spam de requisições QR
- **Hash de comparação** para detectar QR duplicados
- **Estados de interface** para melhor UX
- **Logs estruturados** com debugging detalhado

## Deploy na AWS (EC2)

### Pré-requisitos
- Conta na AWS ativa
- Chave SSH configurada
- Domínio próprio (opcional, mas recomendado)

### Passo 1: Criar instância EC2
1. **AWS Console** → EC2 → **Launch Instance**
2. **Configurações recomendadas:**
   - **Nome**: `OryxBot-Server`
   - **AMI**: Ubuntu Server 22.04 LTS
   - **Tipo**: `t3.small` ou `t3.medium` (para Puppeteer)
   - **Storage**: 20GB
   - **Key Pair**: Crie ou use uma chave SSH existente
   - **Security Group**: Permita portas 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (temporário)

### Passo 2: Configurar servidor via SSH
```bash
# Conectar à instância
ssh -i sua-chave.pem ubuntu@SEU-IP-EC2

# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências do Puppeteer/Chrome
sudo apt install -y \
  wget gnupg ca-certificates fonts-liberation \
  libasound2 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libxss1 libgconf-2-4 \
  chromium-browser

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 e Nginx
sudo npm install -g pm2
sudo apt install nginx -y
```

### Passo 3: Deploy do projeto
```bash
# Clonar projeto
git clone https://github.com/seu-usuario/OryxBot.git
cd OryxBot

# Instalar dependências
npm install

# Criar arquivo .env
nano .env
```

**Exemplo de `.env` para produção:**
```bash
PORT=3000
WHATSAPP_MODE=web
GROQ_API_KEY=gsk_sua-chave-groq
GROQ_MODEL=llama-3.1-70b-versatile
AGENT_TONE=profissional
RAG_TOP_K=3
RAG_CHUNK_SIZE=800
RAG_CHUNK_OVERLAP=120
```

### Passo 4: Configurar PM2
```bash
# Criar arquivo de configuração
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'oryxbot',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'false',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser'
    }
  }]
}
```

```bash
# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Passo 5: Configurar Nginx
```bash
sudo nano /etc/nginx/sites-available/oryxbot
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou use o IP público

    # Interface QR Code
    location /qr {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # APIs do WhatsApp Web
    location /wa-web/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Demais rotas
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Ativar configuração
sudo ln -s /etc/nginx/sites-available/oryxbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Passo 6: Configurar SSL (Certbot)
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Configurar SSL (substitua pelo seu domínio)
sudo certbot --nginx -d seu-dominio.com
```

### Passo 7: Conectar WhatsApp
1. **Acesse** `https://seu-dominio.com/qr`
2. **Escaneie** o QR Code com seu WhatsApp
3. **Aguarde** mensagem de "✅ WhatsApp conectado e pronto!"

### Monitoramento
```bash
# Ver logs do PM2
pm2 logs oryxbot

# Status dos processos
pm2 status

# Reiniciar se necessário
pm2 restart oryxbot

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### URLs importantes na produção
- **Interface QR**: `https://seu-dominio.com/qr`
- **Status API**: `https://seu-dominio.com/wa-web/status`
- **Healthcheck**: `https://seu-dominio.com/`
- **Webhook**: `https://seu-dominio.com/webhook` (para WhatsApp Cloud API)

### Troubleshooting
- **Puppeteer não inicia**: Verificar dependências do Chrome
- **QR Code não aparece**: Verificar logs PM2 e permissões
- **SSL não funciona**: Verificar DNS e configuração do Certbot
- **Performance**: Considerar `t3.medium` para múltiplas conexões

### Backup e Persistência
```bash
# Dados importantes para backup
~/.wwebjs_auth/  # Sessão do WhatsApp
~/OryxBot/data/  # Logs e dados da aplicação
~/OryxBot/.env   # Configurações
```

## Produção (considerações adicionais)
- Use domínio fixo com HTTPS
- Configure monitoramento (ex: Grafana + Prometheus)  
- Implemente rotação de logs
- Configure backup automático dos dados de sessão
- A interface `/qr` permite reconexão remota sem acesso SSH


