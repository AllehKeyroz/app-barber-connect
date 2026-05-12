const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

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

async function login() {
    console.log('[Auth] Iniciando login...');
    
    try {
        // Fecha browser anterior se existir
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

        // Navegar para a pagina de login
        console.log('[Auth] Navegando para pagina de login...');
        await page.goto('https://sistema.appbarber.com.br/index.php', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Aguardar o formulario carregar
        await page.waitForSelector('#login-name', { timeout: 15000 });
        
        // Preencher credenciais
        console.log('[Auth] Preenchendo credenciais...');
        await page.type('#login-name', process.env.APPBARBER_EMAIL, { delay: 50 });
        await page.type('#login-pass', process.env.APPBARBER_PASSWORD, { delay: 50 });

        // Aguardar reCAPTCHA carregar
        console.log('[Auth] Aguardando reCAPTCHA...');
        await page.waitForFunction(() => {
            return typeof grecaptcha !== 'undefined' && grecaptcha.ready;
        }, { timeout: 15000 });
        
        // Pequeno delay para garantir que reCAPTCHA esteja pronto
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Submeter formulario
        console.log('[Auth] Submetendo formulario...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
            page.click('.btnLogin')
        ]);

        // Aguardar redirecionamento ou modal
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verificar se login foi bem-sucedido (URL muda ou aparece modal de selecao)
        const currentUrl = page.url();
        console.log('[Auth] URL apos login:', currentUrl);

        // Verificar se apareceu modal de selecao de empresa
        const empresaModal = await page.$('#login-usuarios');
        if (empresaModal) {
            const isVisible = await page.evaluate(() => {
                const modal = document.getElementById('login-usuarios');
                return modal && modal.classList.contains('in');
            });
            
            if (isVisible) {
                console.log('[Auth] Modal de selecao de empresa detectado, selecionando primeira...');
                await page.click('#divUsuariosLogin button');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // Capturar cookies
        const cookies = await extractCookies();
        
        if (cookies && Object.keys(cookies).length > 0) {
            console.log('[Auth] Login bem-sucedido! Cookies capturados:', Object.keys(cookies));
            currentCookies = cookies;
            return { success: true, cookies };
        } else {
            console.error('[Auth] Login falhou - nenhum cookie relevante encontrado');
            return { success: false, error: 'Nenhum cookie relevante encontrado' };
        }

    } catch (error) {
        console.error('[Auth] Erro no login:', error.message);
        return { success: false, error: error.message };
    }
}

async function extractCookies() {
    if (!page) return null;
    
    const allCookies = await page.cookies('https://sistema.appbarber.com.br');
    const extracted = {};
    
    for (const cookie of allCookies) {
        if (TARGET_COOKIES.includes(cookie.name)) {
            extracted[cookie.name] = cookie.value;
        }
    }
    
    return extracted;
}

async function refreshSession() {
    console.log('[Auth] Refresh de sessao...');
    
    if (!page || !browser) {
        console.log('[Auth] Browser nao inicializado, fazendo login completo...');
        return await login();
    }

    try {
        // Navegar para a pagina principal para manter sessao ativa
        await page.goto('https://sistema.appbarber.com.br/index.php', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verificar se ainda esta logado (se redirecionou para login, precisa relogar)
        const currentUrl = page.url();
        const pageContent = await page.content();
        
        if (currentUrl.includes('index.php') && pageContent.includes('frmLogin')) {
            console.log('[Auth] Sessao expirada, fazendo novo login...');
            return await login();
        }

        // Capturar cookies atualizados
        const cookies = await extractCookies();
        
        if (cookies && Object.keys(cookies).length > 0) {
            currentCookies = cookies;
            console.log('[Auth] Sessao renovada com sucesso');
            return { success: true, cookies };
        } else {
            console.log('[Auth] Cookies nao encontrados no refresh, tentando login...');
            return await login();
        }

    } catch (error) {
        console.error('[Auth] Erro no refresh:', error.message);
        console.log('[Auth] Tentando login completo...');
        return await login();
    }
}

function getCurrentCookies() {
    return currentCookies;
}

function getCookieHeader() {
    const parts = [];
    for (const [name, value] of Object.entries(currentCookies)) {
        parts.push(`${name}=${value}`);
    }
    return parts.join('; ');
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
    getCurrentCookies,
    getCookieHeader,
    extractCookies,
    closeBrowser
};
