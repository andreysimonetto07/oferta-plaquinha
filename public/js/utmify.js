import {captureTracking} from './tracking.js';
import './meta.js';
captureTracking();
// Equivalent to the supplied UTMify tag, decoded for review. Pixel IDs are
// public identifiers; private API tokens must never be added to this file.
(() => {
 if(window.__tapstarUtmifyReady)return;
 window.__tapstarUtmifyReady=true;
 window.pixelId = '6997c4440a47f2ab82f43662';
 const pixelScript = document.createElement('script');
 pixelScript.src = 'https://cdn.utmify.com.br/scripts/pixel/pixel.js';
 pixelScript.async = true;
 pixelScript.defer = true;
 document.head.appendChild(pixelScript);
 const utmsScript=document.createElement('script');
 utmsScript.src='https://cdn.utmify.com.br/scripts/utms/latest.js';
 utmsScript.async=true;utmsScript.defer=true;
 utmsScript.setAttribute('data-utmify-prevent-xcod-sck','');
 utmsScript.setAttribute('data-utmify-prevent-subids','');
 document.head.appendChild(utmsScript);
})();
