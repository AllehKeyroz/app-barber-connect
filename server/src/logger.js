const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_LINES = 500;
const logHistory = [];

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

const TIMEZONE = 'America/Sao_Paulo';

function formatTimestamp() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function getLogFileName() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    return path.join(LOG_DIR, `appbarber-${dateStr}.log`);
}

function writeToFile(level, message) {
    try {
        ensureLogDir();
        const line = `[${formatTimestamp()}] [${level}] ${message}\n`;
        fs.appendFileSync(getLogFileName(), line, 'utf8');
    } catch (e) {
        console.error('[Logger] Erro ao escrever arquivo:', e.message);
    }
}

function addToHistory(level, message) {
    const entry = {
        id: Date.now() + Math.random().toString(36).substring(2, 6),
        timestamp: formatTimestamp(),
        level,
        message
    };
    
    logHistory.unshift(entry);
    
    if (logHistory.length > MAX_LOG_LINES) {
        logHistory.length = MAX_LOG_LINES;
    }
}

function log(level, message) {
    console.log(`[${level}] ${message}`);
    writeToFile(level, message);
    addToHistory(level, message);
}

const logger = {
    info: (msg) => log('INFO', msg),
    warn: (msg) => log('WARN', msg),
    error: (msg) => log('ERROR', msg),
    success: (msg) => log('SUCCESS', msg),
    getHistory: (limit = 100) => logHistory.slice(0, limit),
    getFullHistory: () => [...logHistory]
};

module.exports = logger;
