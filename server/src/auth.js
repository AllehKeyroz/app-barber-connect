const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

const TARGET_COOKIES = [
    'starappappbarberappbeleza-_zldp',
    'starappappbarberappbeleza-_zldt',
    'APPBLZ_ID',
    'PHPSESSID'
];

let browser = null;
let page = null;
let currentCookies = {};

function cookiesToString(cookies) {
    const parts = [];
    for (const [name, value] of Object.entries(cookies)) {
        parts.push(`${name}=${value}`);
    }
    return parts.join('; ');
}

async function extractCookies() {
    if (!page) return null;
    
    const allCookies = await page.cookies('https://sistema.appbarber.com.br');
    const extracted = {};
    
    for (const cookie of allCookies) {
        if (TARGET_COOKIES.includes(cookie.name)) {
            extracted[cookie.name] = cookie.value;
            if (cookie.expires) {
                const expDate = new Date(cookie.expires * 1000);
                logger.info(`Cookie ${cookie.name}: expira em ${expDate.toLocaleString('pt-BR')} (${Math.round((cookie.expires * 1000 - Date.now()) / 60000)} min)`);
            } else {
                logger.info(`Cookie ${cookie.name}: sessao (sem expiracao explicita)`);
            }
        }
    }
    
    return extracted;
}

async function login() {
    logger.info('[Login] Iniciando login...');
    
    try {
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,720'
            ]
        });

        page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36');

        logger.info('[Login] Navegando para pagina de login...');
        await page.goto('https://sistema.appbarber.com.br/index.php', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await page.waitForSelector('#login-name', { timeout: 15000 });
        
        logger.info('[Login] Preenchendo credenciais...');
        await page.type('#login-name', process.env.APPBARBER_EMAIL, { delay: 50 });
        await page.type('#login-pass', process.env.APPBARBER_PASSWORD, { delay: 50 });

        logger.info('[Login] Aguardando reCAPTCHA...');
        await page.waitForFunction(() => {
            return typeof grecaptcha !== 'undefined' && grecaptcha.ready;
        }, { timeout: 15000 });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('[Login] Submetendo formulario...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
            page.click('.btnLogin')
        ]);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentUrl = page.url();
        logger.info(`[Login] URL apos login: ${currentUrl}`);

        // Modal de selecao de empresa
        const empresaModal = await page.$('#login-usuarios');
        if (empresaModal) {
            const isVisible = await page.evaluate(() => {
                const modal = document.getElementById('login-usuarios');
                return modal && modal.classList.contains('in');
            });
            
            if (isVisible) {
                logger.info('[Login] Selecionando empresa...');
                await page.click('#divUsuariosLogin button');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        const cookies = await extractCookies();
        
        if (cookies && Object.keys(cookies).length > 0) {
            logger.success(`[Login] Login bem-sucedido! Cookies: ${Object.keys(cookies).join(', ')}`);
            currentCookies = cookies;
            return { success: true, cookies };
        } else {
            logger.error('[Login] Login falhou - nenhum cookie encontrado');
            return { success: false, error: 'Nenhum cookie encontrado' };
        }

    } catch (error) {
        logger.error(`[Login] Erro: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function refreshSession() {
    logger.info('[Refresh] Iniciando renovacao de sessao...');
    
    if (!page || !browser) {
        logger.warn('[Refresh] Browser nao inicializado, fazendo login completo');
        return await login();
    }

    try {
        const response = await page.goto('https://sistema.appbarber.com.br/index.php', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const currentUrl = page.url();
        const pageContent = await page.content();
        
        if (currentUrl.includes('index.php') && pageContent.includes('frmLogin')) {
            logger.warn('[Refresh] Sessao expirada, refazendo login...');
            return await login();
        }

        const cookies = await extractCookies();
        
        if (cookies && Object.keys(cookies).length > 0) {
            currentCookies = cookies;
            logger.success('[Refresh] Sessao renovada');
            return { success: true, cookies };
        } else {
            logger.warn('[Refresh] Cookies nao encontrados, tentando login...');
            return await login();
        }

    } catch (error) {
        logger.error(`[Refresh] Erro: ${error.message}`);
        return await login();
    }
}

function getCurrentCookies() {
    return currentCookies;
}

async function closeBrowser() {
    if (browser) {
        try { await browser.close(); } catch(e) {}
        browser = null;
        page = null;
    }
}

module.exports = {
    login,
    refreshSession,
    extractCookies,
    getCurrentCookies,
    cookiesToString,
    closeBrowser
};
