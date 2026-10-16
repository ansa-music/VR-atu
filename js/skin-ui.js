import { SKINS, skinId } from './skins.js';
const select = document.getElementById('skin-select');
const label = document.getElementById('skin-description');
let chosen = 'cyan';
try { chosen = skinId(localStorage.getItem('vr-atu-skin')); } catch {}
window.vrAtuSelectedSkin = chosen;
if (select) {
  for (const [id, data] of Object.entries(SKINS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = data.name;
    select.appendChild(option);
  }
  select.value = chosen;
  if (label) label.textContent = SKINS[chosen].name;
  select.addEventListener('change', () => {
    chosen = skinId(select.value);
    window.vrAtuSelectedSkin = chosen;
    if (label) label.textContent = SKINS[chosen].name;
    try { localStorage.setItem('vr-atu-skin', chosen); } catch {}
    window.dispatchEvent(new CustomEvent('skin:changed', { detail: { skin: chosen } }));
  });
}
