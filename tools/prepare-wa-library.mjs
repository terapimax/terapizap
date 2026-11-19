// Uso: node tools/prepare-wa-library.mjs <pasta extraída de @wppconnect/wa-js@4.8.2>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Algumas versões do WhatsApp só disponibilizam o leitor opcional do LID da conta.
// Um LID válido precisa vir da sessão autenticada que vai enviar a mensagem.
function ownLid(prefs) {
  if (typeof prefs?.getMeLidUserOrThrow === 'function') return prefs.getMeLidUserOrThrow();
  for (const name of ['getMaybeMeLidUser', 'getMaybeMeLid']) {
    const wid = typeof prefs?.[name] === 'function' ? prefs[name]() : null;
    if (wid?.server === 'lid' || wid?.isLid?.() === true) return wid;
  }
  if (typeof WPP !== 'undefined') {
    const self = WPP.conn.getMyUserId();
    const wid = self && WPP.whatsapp.lidPnCache?.getCurrentLid?.(self);
    if (wid?.server === 'lid' || wid?.isLid?.() === true) return wid;
  }
  throw new Error('O WhatsApp ainda não disponibilizou o identificador desta conta.');
}

function isMessageKey(module, id) {
  const key = module?.default;
  if (typeof key !== 'function') return false;
  if (id === 'WAWebMsgKey' && typeof key.fromString === 'function' && typeof key.prototype?.equals === 'function') return true;
  return Function.prototype.toString.call(key).includes('MsgKey error: obj is null/undefined');
}

// O loader Meta pode ter uma pausa entre os primeiros scripts e os módulos da sessão.
// Os listeners da WA-JS só podem ser registrados quando seus getters já resolvem.
async function waitForChatModules(loader) {
  const checks = [
    ['a identificação das mensagens (MsgKey)', wa => typeof wa.MsgKey === 'function'],
    ['a sessão (isAuthenticated)', wa => typeof wa.functions.isAuthenticated === 'function'],
    ['a lista de conversas (ChatStore)', wa => typeof wa.ChatStore?.get === 'function'],
    ['o histórico (MsgStore)', wa => typeof wa.MsgStore?.on === 'function'],
    ['os contatos (ContactModel)', wa => typeof wa.ContactModel === 'function'],
  ];
  let delay = 250;
  for (;;) {
    loader.zapflowWaitingFor = 'a lista de conversas do WhatsApp';
    if (document.querySelector('#pane-side, #main, [data-testid="chat-list"]')) {
      const wa = window.WPP?.whatsapp;
      try {
        const missing = checks.find(([label, available]) => {
          loader.zapflowWaitingFor = label;
          return !wa || !available(wa);
        });
        if (!missing) {
          loader.zapflowWaitingFor = null;
          return;
        }
      } catch { /* A dependência ainda não terminou de carregar. */ }
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 5000);
  }
}

if (!process.argv[2]) throw new Error('Informe a pasta extraída do pacote WA-JS.');
const dist = resolve(process.argv[2], 'dist');
const bundle = readFileSync(join(dist, 'wppconnect-wa.js'));
const hash = createHash('sha256').update(bundle).digest('hex');
if (hash !== 'b1a9c3c42357ad2a9fb7504f460c909dcf0e2b1ad8129abdb485f151164a4b10') {
  throw new Error('O pacote difere do WA-JS 4.8.2 validado para esta adaptação.');
}
let source = bundle.toString('utf8');
function replaceOnce(original, replacement) {
  if (source.split(original).length !== 2) throw new Error('Trecho inesperado no pacote WA-JS: ' + original);
  source = source.replace(original, () => replacement);
}
const lidReader = 'const e=n.UserPrefs;if("function"==typeof(null==e?void 0:e.getMeLidUserOrThrow))return e.getMeLidUserOrThrow();if("function"==typeof(null==e?void 0:e.getMaybeMeLidUser)){const t=e.getMaybeMeLidUser();if(t)return t}throw new Error("The account LID is unavailable")';
replaceOnce(lidReader, `return (${ownLid.toString()})(n.UserPrefs)`);

// Reconhece o módulo nativo mesmo quando o texto interno da classe muda.
const keyLookup = 'c=e=>{var t,r;if(!(null===(t=null==e?void 0:e.default)||void 0===t?void 0:t.toString().includes("MsgKey error: obj is null/undefined")))return!1;';
replaceOnce(keyLookup, `c=(e,id)=>{var r;if(!(${isMessageKey.toString()})(e,id))return!1;`);
replaceOnce('{MsgKey:"default"},(e,t)=>c(e)', '{MsgKey:"default"},(e,t)=>c(e,t)');

const authLookup = '{isAuthenticated:["isLoggedIn","Z"],isLoggedIn:["isLoggedIn","Z"]},e=>{var t,r;return';
replaceOnce(authLookup, '{isAuthenticated:["isLoggedIn","Z","isAuthenticated"],isLoggedIn:["isLoggedIn","Z","isAuthenticated"]},(e,id)=>{var t,r;return(id==="WAWebUserPrefsIsLoggedIn"&&typeof e.isAuthenticated==="function")||');

const markInjected = 't.isInjected=!0,u("injected"),await i.internalEv.emitAsync("loader.injected")';
replaceOnce('}(),' + markInjected, `}(),await (${waitForChatModules.toString()})(t),${markInjected}`);
// Durante a verificação, a ausência é temporária. O getter continua ativo, e
// o painel exibe o módulo pendente. Após iniciar, os diagnósticos originais se aplicam.
const lookup = 'const i=d.searchId(r);if(!i){';
replaceOnce(lookup, lookup + 'if("meta"===d.loaderType&&!d.isInjected)return;');
const extension = fileURLToPath(new URL('../extension/', import.meta.url));
writeFileSync(join(extension, 'wppconnect-wa.js'), source);
copyFileSync(join(dist, 'wppconnect-wa.js.LICENSE.txt'), join(extension, 'wppconnect-wa.js.LICENSE.txt'));
