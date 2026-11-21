// Only count known channels. Never transmit full campaign URLs or identifiers.
const source = new URLSearchParams(location.search).get('utm_source');
const channel = ['x', 'whatsapp', 'bulten'].includes(source) ? source : 'diger';
function count(action) {
  if (location.hostname !== 'harmanhaber.app' || navigator.webdriver) return;
  try {
    const optOut = localStorage.getItem('gk-nosay');
    if (optOut === 'true' || (optOut === null && JSON.parse(localStorage.getItem('gk-admin')))) return;
    const body = JSON.stringify({e: ['pilot:' + action + ':' + channel]});
    navigator.sendBeacon('https://harman-sayac.harmanhaber.workers.dev/e', new Blob([body], {type: 'text/plain'}));
  } catch { /* The page also works with storage and analytics disabled. */ }
}
count('acilis');
let clicked = false;
document.querySelector('main').addEventListener('click', event => {
  if (!clicked && event.target.closest('article a')) {
    clicked = true;
    count('kaynak');
  }
});
