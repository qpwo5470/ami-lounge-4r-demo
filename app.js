(() => {
  'use strict';
  const menu = window.DEMO_MENU;
  const content = document.querySelector('#content');
  const title = document.querySelector('#title');
  const description = document.querySelector('#description');
  const back = document.querySelector('#back');
  const step = document.querySelector('#step');
  const devicePicker = document.querySelector('#device');
  const requestedDevice = new URLSearchParams(window.location.search).get('device');
  let device = requestedDevice === 'R' ? 'R' : 'L';
  devicePicker.value = device;
  const displayName = item => item.names?.[device] || item.name;
  let category = null;
  let selected = null;
  function button(label, className, action) {
    const node = document.createElement('button');
    node.className = className;
    node.textContent = label;
    node.addEventListener('click', action);
    return node;
  }
  function render(focus = true) {
    content.replaceChildren();
    back.hidden = !category;
    if (!category) {
      step.textContent = '카테고리 선택';
      title.textContent = '어떤 음료를 고를까요?';
      description.textContent = '따뜻하게 또는 시원하게, 카테고리를 선택해 주세요.';
      content.className = 'categories';
      for (const c of ['HOT', 'ICE']) {
        const count = menu.filter(item => item.category === c).length;
        const b = button('', `category ${c.toLowerCase()}`, () => { category = c; render(); });
        const strong = document.createElement('strong'); strong.textContent = c;
        const small = document.createElement('small'); small.textContent = `${c === 'HOT' ? '따뜻한 음료' : '시원한 음료'} ${count}종`;
        b.append(strong, small); content.append(b);
      }
    } else if (!selected) {
      step.textContent = '음료 선택';
      title.textContent = `${category} 음료`;
      description.textContent = '음료를 선택하면 데모 QR이 나타납니다.';
      content.className = 'drinks';
      for (const item of menu.filter(item => item.category === category)) {
        content.append(button(displayName(item), 'drink', () => { selected = item; render(); }));
      }
    } else {
      step.textContent = 'QR 보기';
      title.textContent = `${selected.category} ${displayName(selected)}`;
      description.textContent = `포병여단 ${device} 기기의 스캐너에 QR을 보여주세요.`;
      content.className = '';
      const panel = document.createElement('div'); panel.className = 'qr-panel';
      const img = document.createElement('img'); img.src = `qr/${selected.id}.svg`; img.alt = `${selected.category} ${displayName(selected)} 현장 데모 QR`;
      const label = document.createElement('strong'); label.textContent = '무료 음료 데모';
      const note = document.createElement('p'); note.textContent = '기기가 준비된 상태에서 사용해 주세요. 시간·횟수 제한 없이 사용할 수 있습니다.';
      panel.append(img, label, note); content.append(panel);
    }
    if (focus) title.focus();
  }
  devicePicker.addEventListener('change', () => { device = devicePicker.value; render(); });
  back.addEventListener('click', () => { if (selected) selected = null; else category = null; render(); });
  render(false);
})();
