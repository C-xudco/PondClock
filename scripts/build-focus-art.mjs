// Original code-authored watercolour vectors, bundled offline. Reproducible assets.
import fs from 'node:fs';
const regions = {
  taihu: { color: '#91afb0', hills: 'M0 205Q70 168 130 190Q205 134 290 188Q400 158 510 205Z',
    motif: '<path d="M53 226l18-35 14 17 18-40 12 38 20-8 17 28Z" fill="#677c73"/><path d="M348 241h57l-16 11h-28Z"/><path d="M375 182v59h-3l-24-4 24-48m7 4 23 42h-23" fill="#d4dbcb"/>' },
  dongting: { color: '#9eac98', hills: 'M0 210Q190 192 280 163Q355 138 448 177Q530 196 680 208Z',
    motif: '<path d="M320 166h37m-32-6h26m-29 6 6-10h19l8 10m-26 0v12m20-12v12" fill="none" stroke-width="2"/><path d="M35 249l-7-65m15 67 9-60m-23 40-16-22m38 21 12-30m11 60 6-63m-1 34 16-19" fill="none" stroke-width="2"/>' },
  jialing: { color: '#91a69b', hills: 'M0 215L60 101L130 178L224 70L310 171L390 114L480 208L565 148L670 210Z',
    motif: '<path d="M45 211v-38h82v38m-91-39 49-23 51 23m-81 5h62m-90 26h125m-64-26v32m76-3v-45h75v45m-82-45 47-20 44 20" fill="none" stroke-width="3"/>' },
  baiyangdian: { color: '#a6b4a0', hills: 'M0 210Q260 196 440 204Q620 187 740 210Z',
    motif: '<g fill="none" stroke-width="2"><path d="M30 265l-8-76m18 76 5-83m12 85 19-62m-49 40-17-23m34 7 19-22m28 67 8-70m0 39 17-20"/></g><ellipse cx="200" cy="266" rx="29" ry="5" fill="#7b9a85"/><ellipse cx="268" cy="283" rx="21" ry="4" fill="#7b9a85"/><path d="M473 211q29-33 65-4l-5 4Z"/>' },
  jiaodong: { color: '#90acb3', hills: 'M0 210Q54 203 108 176Q155 158 202 184Q256 169 301 205L510 211Z',
    motif: '<path d="M159 179v-35h13v35m-17-35h21l-10-11Z"/><path d="M290 252q30 8 62 0m31 34q34 8 72-1m-2-46q26 7 57 0m-139-120q10-9 20 0 10-9 20 0" fill="none" stroke-width="2"/>' },
};
fs.mkdirSync('public/art/inkwash', { recursive: true });
for (const [id, art] of Object.entries(regions)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="440" viewBox="0 0 1000 440"><defs><linearGradient id="water" x2="0" y2="1"><stop stop-color="#d5e0d8"/><stop offset="1" stop-color="${art.color}"/></linearGradient><filter id="wash"><feTurbulence type="fractalNoise" baseFrequency=".025" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter><filter id="paper"><feTurbulence baseFrequency=".7" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .4 0 0 0 0 .45 0 0 0 0 .35 0 0 0 .09 0"/></filter></defs><rect width="1000" height="440" fill="#e9eadd"/><path d="${art.hills}" fill="${art.color}" opacity=".35" filter="url(#wash)"/><path d="${art.hills}" transform="translate(260 32) scale(.8)" fill="#819a8b" opacity=".24"/><rect y="210" width="1000" height="230" fill="url(#water)"/><path d="M0 212Q310 200 660 211T1000 210" stroke="#7c988a" stroke-width="3" fill="none" opacity=".5"/><g stroke="#4e685d" fill="#667f70" opacity=".8" filter="url(#wash)">${art.motif}</g><g fill="none" stroke="#edf0db" opacity=".45"><path d="M54 292h217m99 16h166M120 354h274m87 25h106M38 412h255"/></g><path d="M1000 268L940 285L855 307L790 330L745 360L690 395L565 440H1000Z" fill="#637568" filter="url(#wash)"/><path d="M1000 276L942 294L861 315L795 338" fill="none" stroke="#a4ad96" stroke-width="6" opacity=".7"/><path d="M913 325l18-19 25 2 22 22-16 20-42-7Z" fill="#768171"/><path d="M927 323l13-8 21 9-16 11-18-5Z" fill="#a7aa91"/><path d="M964 305l-5-66m0 43-21-30m22 15 21-34m-18 52 24-26m-9 75-5-64" stroke="#3e584b" stroke-width="2" fill="none"/><rect width="1000" height="440" filter="url(#paper)" opacity=".65"/></svg>`;
  fs.writeFileSync(`public/art/inkwash/${id}-v1.svg`, svg + '\n');
}
console.log('5 original regional vector-watercolour assets generated.');
