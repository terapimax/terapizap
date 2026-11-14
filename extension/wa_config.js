// wa_config.js — Configuração da WA-JS (roda no MAIN world ANTES de wppconnect-wa.js)
// - Desliga o Google Analytics embutido da WA-JS (por padrão ela reporta uso aos servidores do WPPConnect)
// - Remove a assinatura "WA-JS" (poweredBy) para não deixar rastro de automação
window.WPPConfig = Object.assign({}, window.WPPConfig, {
    disableGoogleAnalytics: true,
    googleAnalyticsId: null,
    poweredBy: null,
    deviceName: false,
});
