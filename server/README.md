# AppBarber Session Server

Servidor Node.js que mantem sessao autenticada no AppBarber e sincroniza cookies via webhook.

## Como funciona

1. Faz login automatico no AppBarber usando Puppeteer (navegador headless)
2. Captura os cookies de sessao apos autenticacao
3. Envia cookies para webhook configurado (n8n)
4. Renova a sessao periodicamente (default: a cada 30 minutos)
5. Se a sessao expirar, faz novo login automaticamente

## Deploy no EasyPanel

### Via Docker (recomendado)

1. Crie um novo servico no EasyPanel do tipo **App**
2. Conecte ao repositorio Git ou faca upload do codigo
3. Configure as variaveis de ambiente:

| Variavel | Valor |
|----------|-------|
| `APPBARBER_EMAIL` | Email de login |
| `APPBARBER_PASSWORD` | Senha |
| `WEBHOOK_URL` | URL do webhook para receber cookies |
| `REFRESH_INTERVAL` | Intervalo em minutos (default: 30) |
| `PORT` | Porta do servidor (default: 3000) |

4. O Dockerfile ja esta configurado com todas as dependencias do Chromium

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/health` | Health check - status geral |
| GET | `/status` | Status detalhado com cookies ativos |
| POST | `/refresh` | Forca refresh da sessao |
| POST | `/login` | Forca login completo |

## Estrutura

```
server/
├── Dockerfile          - Container com Chromium + Node.js
├── package.json        - Dependencias
├── .env                - Variaveis de ambiente (local)
├── .env.example        - Template de variaveis
├── .gitignore
└── src/
    ├── index.js        - Entry point, Express server, inicializacao
    ├── auth.js         - Login via Puppeteer, captura e refresh de cookies
    ├── scheduler.js    - Cron job para refresh periodico
    └── webhook.js      - Envio de cookies para webhook
```

## Desenvolvimento local

```bash
cd server
npm install
cp .env.example .env    # Editar com credenciais
npm start
```

## Payload enviado ao webhook

```json
{
  "event": "cookie_sync",
  "source": "server",
  "cookies": {
    "PHPSESSID": "...",
    "APPBLZ_ID": "...",
    "starappappbarberappbeleza-_zldp": "...",
    "starappappbarberappbeleza-_zldt": "..."
  },
  "cookie_header_full": "PHPSESSID=...; APPBLZ_ID=...; ...",
  "timestamp": "2026-04-23T18:00:00.000Z"
}
```
