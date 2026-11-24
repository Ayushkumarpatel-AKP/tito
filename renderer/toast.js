// Small "Tito is awake" greeting that slides in at the bottom-right after Windows starts.
(async () => {
  const q = new URLSearchParams(location.search);
  const state = q.get('state') === 'error' ? 'error' : 'greeting';
  document.getElementById('bubble').textContent = q.get('text') || 'Hi, I am Tito.';
  await window.TitoSprite.ready;
  const pet = new window.TitoSprite.Sprite(document.getElementById('pet'), { scale: 0.62 });
  pet.play(state, { then: 'idle' });
  const wrap = document.getElementById('wrap');
  wrap.onclick = () => window.tito.toastClick();
  setTimeout(() => { wrap.classList.add('out'); setTimeout(() => window.tito.toastDone(), 420); }, state === 'error' ? 7000 : 5200);
})();
