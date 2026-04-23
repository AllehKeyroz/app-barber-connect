# App Barber Connector

Extensao Chrome (Manifest V3) para monitoramento e sincronizacao de dados do sistema [AppBarber](https://sistema.appbarber.com.br) com webhooks externos (n8n).

## Funcionalidades

### 1. Sincronizacao de Cookies

Monitora e envia automaticamente os cookies de sessao do AppBarber para um webhook externo. Util para manter integracao autenticada com CRMs e automacoes.

**Cookies monitorados:**
- `starappappbarberappbeleza-_zldp`
- `starappappbarberappbeleza-_zldt`
- `APPBLZ_ID`
- `PHPSESSID`

**Gatilhos de envio:**
- Alteracao de cookie detectada pelo Chrome (`cookies.onChanged`)
- Navegacao para pagina do AppBarber (`webNavigation.onCompleted`)
- Alarme periodico a cada 60 minutos (fallback)
- Botao manual no popup da extensao

**Payload enviado:**
```json
{
  "event": "cookie_sync",
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

### 2. Interceptacao de Agendamentos

Monitora todas as acoes de agendamento realizadas no sistema AppBarber e envia os dados normalizados via webhook.

#### Eventos Monitorados

| Evento | Endpoint AppBarber | Descricao |
|--------|-------------------|-----------|
| `new` | `insereAgendamentov5.php` | Novo agendamento criado |
| `update` | `alteraAgendamento.php` | Agendamento alterado (data, hora, profissional, servico) |
| `cancelled` | `cancelaHorario.php` | Agendamento cancelado |
| `confirmed` | `atualizaHorario.php` (tipo=5) | Cliente confirmou o horario |
| `showed` | `atualizaHorario.php` (tipo=8) | Cliente chegou ao local |
| `noshow` | `atualizaHorario.php` (tipo=1) | Cliente nao compareceu |

#### Payload Padronizado (todos os eventos)

```json
{
  "event": "new",
  "scheduling_data": {
    "agendamento_id": "305265464",
    "comcodigo": "209947499",
    "data": "2026-12-31",
    "hora": "09:00",
    "profissional_id": "9503822",
    "servico_id": "529001",
    "cliente_id": "9516573",
    "duracao": "30",
    "motivo": null,
    "tipo": null,
    "status": null,
    "extras": {
      "tipoitem": "1",
      "numitens": "1",
      "ageorigem": "2",
      "cupom": "",
      "lembrete": "0",
      "tempolembrete": "60",
      "sms": "0",
      "whats": "0"
    }
  },
  "raw_payload": "item=529001&tipoitem=1&profissional=9503822&...",
  "timestamp": "2026-04-23T18:00:00.000Z"
}
```

#### Campos por Evento

| Campo | new | update | cancelled | confirmed | showed | noshow |
|-------|-----|--------|-----------|-----------|--------|--------|
| `agendamento_id` | resposta (`agecodigo`) | `codItem` | `agendamento` | `agendamento` | `agendamento` | `agendamento` |
| `comcodigo` | resposta | - | - | - | - | - |
| `data` | `dataagendamento` | `dataAlteraAgendamento` | - | - | - | - |
| `hora` | `dataagendamento` | `horaAlteraAgendamento` | - | - | - | - |
| `profissional_id` | `profissional` | `profissionalAlteraAgendamento` | - | - | - | - |
| `servico_id` | `item` | `servicoAlteraAgendamento` | - | - | - | - |
| `cliente_id` | `cliente` | - | - | - | - | - |
| `duracao` | `duracao` | - | - | - | - | - |
| `motivo` | - | - | `motivo` | - | - | - |
| `tipo` | - | - | - | `tipo` | `tipo` | `tipo` |
| `status` | - | - | - | `status` | `status` | `status` |

#### Normalizacao de Data/Hora

- **Novo agendamento**: `dataagendamento=2026-12-31+09:00` -> `data: "2026-12-31"`, `hora: "09:00"`
- **Alteracao**: `dataAlteraAgendamento=31/12/2026` (dd/mm/yyyy) -> `data: "2026-12-31"` (yyyy-mm-dd)
- **Hora sempre em formato 24h**: `hora: "09:00"`

## Arquitetura

```
+-------------------+     +-------------------+     +-------------------+
|    inject.js      |     |    content.js     |     |  background.js    |
|  (MAIN world)     |---->|  (ISOLATED world) |---->|  (Service Worker) |----> Webhook
|                   |     |                   |     |                   |
| Intercepta XHR/   | postMessage | Repassa msgs  | chrome  | Normaliza dados |
| Fetch do insere   |     | para background   | .runtime| Envia via fetch  |
| Agendamento       |     |                   | .send   |                   |
+-------------------+     +-------------------+  Message+-------------------+
                                                            |
                          +-------------------+             |
                          | chrome.webRequest |-------------+
                          | (background.js)   |
                          |                   |
                          | Intercepta:       |
                          | - alteraAgendamento|
                          | - cancelaHorario  |
                          | - atualizaHorario |
                          +-------------------+
```

### Arquivos

| Arquivo | Descricao |
|---------|-----------|
| `manifest.json` | Configuracao da extensao (Manifest V3), permissoes, content scripts |
| `background.js` | Service worker - logica principal, normalizacao, envio de webhooks, sync de cookies |
| `inject.js` | Injetado no MAIN world da pagina - intercepta XHR/Fetch para capturar request + response do `insereAgendamentov5.php` |
| `content.js` | Roda no ISOLATED world - ponte entre inject.js e background.js via `postMessage` |
| `popup.html` | Interface do popup da extensao |
| `popup.js` | Logica do popup - exibe status e botao de sincronizacao manual |
| `popup.css` | Estilos do popup |
| `icon.png` | Icone da extensao |

### Por que dois metodos de interceptacao?

- **`chrome.webRequest`** (background.js): Captura requisicoes HTTP diretamente no navegador. Confiavel para `alteraAgendamento`, `cancelaHorario` e `atualizaHorario`. Nao consegue capturar o **body da resposta**.
- **`inject.js` (MAIN world)**: Necessario para `insereAgendamentov5.php` porque precisa capturar a **resposta do servidor** (que contem o `agecodigo` - ID do agendamento criado).

### Permissoes Necessarias

| Permissao | Motivo |
|-----------|--------|
| `cookies` | Ler cookies de sessao do AppBarber |
| `alarms` | Alarme periodico para sync de cookies |
| `storage` | Armazenar estado local (ultimo cookie, timestamp) |
| `webNavigation` | Detectar navegacao para paginas do AppBarber |
| `webRequest` | Interceptar requisicoes HTTP para agendamentos |

## Instalacao

1. Clone o repositorio
2. Abra `chrome://extensions/` no Chrome
3. Ative o **Modo do desenvolvedor**
4. Clique em **Carregar sem compactacao**
5. Selecione a pasta do projeto

## Configuracao

Os endpoints de webhook estao definidos no inicio do `background.js`:

```javascript
// Webhook para sincronizacao de cookies
const ENDPOINT_DESTINO = "https://n8n-kds-brasil-n8n.znjbnt.easypanel.host/webhook/...";

// Webhook para eventos de agendamento
const ENDPOINT_AGENDAMENTO = "https://n8n.kdsbrasil.com/webhook/sync-agendamento";
```

## Uso

Apos instalar, a extensao funciona automaticamente em segundo plano quando o usuario acessa `sistema.appbarber.com.br`. O popup exibe o status da conexao e permite sincronizacao manual de cookies.
