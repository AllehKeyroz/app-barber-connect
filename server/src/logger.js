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

function formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

function getLogFileName() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
