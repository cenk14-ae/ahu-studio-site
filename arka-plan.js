// KOZMİK ARKA PLAN MOTORU — giris-arka-plan.html'den alındı (08.10.2026), değiştirilmedi.
// Giriş ekranının arkasında çalışır; program/ana sayfa açılınca index.html KozmikArkaPlan.duraklat() çağırır.
(function () {
  'use strict';

  /* ---------------- AYARLAR ---------------- */
  var VARSAYILAN = {
    canvasId: 'kozmik-bg',
    mod: 'otomatik',          // 'otomatik' = sahneler kendiliğinden değişir | 'kaydirma' = sayfa kaydırıldıkça değişir
    sahneler: ['halka', 'sarmal', 'yildiz', 'dalga', 'kuyu', 'karadelik', 'galaksi'], // sıra/seçim değiştirilebilir
    sahneSuresi: 7,           // saniye — her sahnede bekleme
    gecisSuresi: 2.8,         // saniye — iki sahne arası dönüşüm
    girisAnimasyonu: true,    // açılışta dağınık yıldızlardan ilk sahneye toplanma
    parcacikSayisi: 26000,    // masaüstü
    mobilParcacikSayisi: 15000,
    yildizSayisi: 1800,       // arka plandaki sabit yıldızlar
    fareEtkisi: true,         // fare ile hafif perspektif kayması
    otomatikKalite: true,     // yavaş cihazda parçacık sayısını ve çözünürlüğü kendisi düşürür
    maksPikselOrani: 2,       // retina ekranlarda en fazla 2x çiz
    hiz: 1.0,                 // hareket hızı çarpanı
    parlaklik: 1.0,           // genel parlaklık çarpanı
    parilti: 1.0              // ışıma (bloom) gücü; 0 = kapalı (en hafif mod)
  };

  var SAHNE_ID = { halka: 0, sarmal: 1, yildiz: 2, dalga: 3, kuyu: 4, karadelik: 5, galaksi: 6 };
  var SAHNE_AD = ['halka', 'sarmal', 'yildiz', 'dalga', 'kuyu', 'karadelik', 'galaksi'];

  var cfg = {};
  var k;
  for (k in VARSAYILAN) cfg[k] = VARSAYILAN[k];
  var kul = window.KOZMIK_AYARLAR || {};
  for (k in kul) if (Object.prototype.hasOwnProperty.call(kul, k)) cfg[k] = kul[k];

  var qs = new URLSearchParams(location.search);
  if (qs.get('mod')) cfg.mod = qs.get('mod');
  if (qs.get('kalite') === 'sabit') cfg.otomatikKalite = false;
  var debug = qs.get('debug') === '1';

  var sira = [];
  (cfg.sahneler || []).forEach(function (n) {
    var id = typeof n === 'number' ? n : SAHNE_ID[String(n).toLowerCase()];
    if (id !== undefined && id >= 0 && id <= 6) sira.push(id);
  });
  if (!sira.length) sira = [0, 1, 2, 3, 4, 5, 6];

  var sabitSahne = null;
  if (qs.get('sahne') !== null) {
    var sq = qs.get('sahne');
    var sid = isNaN(+sq) ? SAHNE_ID[sq.toLowerCase()] : +sq;
    if (sid !== undefined && sid >= 0 && sid <= 6) sabitSahne = sid;
  }

  var canvas = document.getElementById(cfg.canvasId);
  if (!canvas) return;

  /* ---------------- SHADER'LAR ---------------- */
  var VS = [
    'precision highp float;',
    'attribute vec4 aS1;',
    'attribute vec4 aS2;',
    'uniform float uTime, uA, uB, uMix, uLayer, uAspect, uFit, uGain, uPx;',
    'uniform vec2 uRot;',
    'uniform mat4 uProj;',
    'varying vec3 vCol;',
    'varying float vAl;',
    '#define PI 3.14159265',
    '#define TAU 6.28318531',
    'float h11(float n){ return fract(sin(n*12.9898)*43758.5453); }',
    'float gs(float a, float b){ return sqrt(-2.0*log(max(a,1e-4)))*cos(TAU*b); }',
    'vec3 rX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}',
    'vec3 rY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}',
    'vec3 rZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}',
    'vec2 r2(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}',
    'float inv(float e0,float e1,float x){ return 1.0-smoothstep(e0,e1,x); }',
    'const vec3 DEEP=vec3(.10,.20,.92);',
    'const vec3 BLUE=vec3(.20,.45,1.0);',
    'const vec3 CYAN=vec3(.32,.82,1.0);',
    'const vec3 ICE =vec3(.84,.93,1.0);',
    'const vec3 VIOL=vec3(.56,.38,1.0);',
    'const vec3 MAG =vec3(1.0,.34,.70);',
    'const vec3 RED =vec3(1.0,.30,.26);',
    'const vec3 GOLD=vec3(1.0,.80,.58);',
    // half-height of the view at distance D (fov 45°): 0.4142*D
    'float hh(float D){ return 0.4142*D; }',

    /* 0 — HALKA: dalgalı ışık filamentlerinden halka */
    'void sHalka(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float L=floor(a.x*56.0); float lf=L/55.0;',
    '  float th=a.y*TAU + t*0.05*(h11(L)-0.5);',
    '  float k1=h11(L+1.3)*TAU, k2=h11(L+7.1)*TAU, k3=h11(L+3.7)*TAU;',
    '  float r=1.12+(lf-0.5)*0.26',
    '    +0.105*sin(th*3.0+t*0.50+k1)',
    '    +0.060*sin(th*5.0-t*0.75+k2)',
    '    +0.030*sin(th*9.0+t*1.20+k3)',
    '    +0.014*sin(th*17.0-t*1.90+L);',
    '  float zz=0.32*sin(th*2.0+k1+t*0.30)+0.12*sin(th*4.0-t*0.45+k2);',
    '  p=vec3(cos(th)*r, sin(th)*r, zz) + (b.xyz-0.5)*0.008;',
    '  al=0.55; z=1.0;',
    '  if(b.w>0.93){ float rr=1.12+gs(a.z,a.w)*0.22; p=vec3(cos(th)*rr, sin(th)*rr, gs(b.x,b.y)*0.3); al=0.22; z=0.8; }',
    '  float sy=sin(th), cx=cos(th);',
    '  float top=smoothstep(0.05,0.95,sy);',
    '  vec3 warm=mix(RED,MAG,cx*0.5+0.5);',
    '  c=mix(BLUE,CYAN,0.5+0.5*sin(th*2.0+L*0.9));',
    '  c=mix(c,warm,top*0.85);',
    '  float hot=inv(-1.0,-0.55,sy);',
    '  c=mix(c,ICE,hot*0.65+0.35*step(0.9,h11(L+11.0)));',
    '  al*=1.0+hot*0.8;',
    '  p=rY(p,0.22*sin(t*0.21)); p=rX(p,0.14*sin(t*0.17));',
    '  p*=uFit;',
    '}',

    /* 1 — SARMAL: dönen çift sarmal (DNA) */
    'void sSarmal(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float R=0.38*mix(1.0,uFit,0.5); float tw=1.85;',
    '  float y=(a.x-0.5)*4.8;',
    '  float ang=y*tw+t*0.65;',
    '  z=1.0; al=0.50;',
    '  if(a.y<0.80){',
    '    if(a.y>=0.40) ang+=PI;',
    '    p=vec3(cos(ang)*R, y, sin(ang)*R);',
    '    p+=vec3(gs(a.z,a.w), gs(b.x,b.y)*0.6, gs(b.z,a.z))*0.068;',
    '  } else {',
    '    float yr=(floor(a.x*46.0)+0.5)/46.0; y=(yr-0.5)*4.8; ang=y*tw+t*0.65;',
    '    vec3 A=vec3(cos(ang)*R, y, sin(ang)*R);',
    '    p=mix(A, vec3(-A.x,y,-A.z), a.z)+(b.xyz-0.5)*0.03;',
    '    al=0.26;',
    '  }',
    '  if(b.w>0.95){ p+=normalize(b.xyz-0.5+1e-3)*(0.2+0.6*a.w); al=0.20; z=0.8; }',
    '  float fr=smoothstep(-R,R,p.z);',
    '  c=mix(DEEP,CYAN,fr);',
    '  c=mix(c,ICE,step(0.88,b.y)*0.7);',
    '  al*=0.55+0.65*fr;',
    '  p=rZ(p,0.10);',
    '}',

    /* 2 — YILDIZ ALANI: kameraya doğru akan yıldızlar + sağda bulutsu */
    'void sYildiz(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  if(b.w<0.66){',
    '    float f=fract(a.z+t*0.016);',
    '    float zz=mix(-7.0,2.6,f); float D=4.2-zz;',
    '    p=vec3((a.x-0.5)*2.2*hh(D)*max(uAspect,0.6), (a.y-0.5)*2.2*hh(D), zz);',
    '    al=smoothstep(0.0,0.12,f)*inv(0.86,1.0,f)*(0.18+0.55*b.x*b.x);',
    '    z=0.6+1.0*b.y;',
    '    c=mix(ICE,BLUE,b.z*0.6);',
    '    if(b.z>0.95) c=GOLD;',
    '  } else {',
    '    vec3 g=vec3(gs(a.x,a.y), gs(a.z,b.x), gs(b.y,a.w))*vec3(0.85,0.5,0.6);',
    '    g.xy=r2(g.xy, 0.5+t*0.05+length(g.xy)*0.8);',
    '    p=g+vec3(1.25*max(min(uAspect,1.6),0.8), 0.45, -1.2);',
    '    c=mix(VIOL,BLUE,b.z); c=mix(c,ICE,step(0.8,b.y)*0.6);',
    '    al=0.42*exp(-dot(g,g)*0.6); z=0.9;',
    '  }',
    '}',

    /* 3 — DALGA: soldan maviden sağda kırmızıya geçen dalgalı yüzey */
    'void sDalga(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float L=floor(a.x*64.0); float lf=L/63.0;',
    '  float zz=1.2-lf*5.6; float D=4.2-zz;',
    '  float W=hh(D)*uAspect*1.15;',
    '  float x=(a.y-0.5)*2.0*W;',
    '  float h=0.30*sin(x*0.70+t*0.42+zz*0.85)',
    '        +0.15*sin(x*1.65-t*0.58+zz*1.55+1.3)',
    '        +0.065*sin(x*3.70+t*1.05+zz*2.6)',
    '        +0.03*sin(x*7.30-t*1.60+zz*4.0);',
    '  float amp=0.85+0.5*lf;',
    '  float y=-0.38+lf*0.30+h*amp;',
    '  p=vec3(x,y,zz)+(b.xyz-0.5)*vec3(0.01,0.012,0.03);',
    '  float u=clamp(x/(2.0*W)+0.5,0.0,1.0);',
    '  c=mix(BLUE,VIOL,smoothstep(0.0,0.55,u));',
    '  c=mix(c,RED,smoothstep(0.5,1.0,u));',
    '  float cr=smoothstep(0.0,0.45,h);',
    '  c=mix(c,ICE,cr*0.45);',
    '  al=(0.14+1.0*cr*cr)*mix(1.0,0.6,lf);',
    '  z=1.0;',
    '}',

    /* 4 — ÇEKİM KUYUSU: ortası çöken parçacık ızgarası */
    'void sKuyu(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float N=44.0; float S=7.5;',
    '  float q=(floor(a.y*N)+0.5)/N-0.5;',
    '  vec2 g;',
    '  if(a.z<0.5) g=vec2((a.x-0.5)*S, q*S); else g=vec2(q*S, (a.x-0.5)*S);',
    '  vec2 gr=r2(g, t*0.04);',
    '  float r=length(gr);',
    '  float dip=1.7/(1.0+r*r*2.2);',
    '  float y=-dip+0.035*sin(r*7.0-t*1.6)*exp(-r*0.6);',
    '  p=vec3(gr.x,y,gr.y)+(b.xyz-0.5)*0.012;',
    '  p=rX(p,0.62);',
    '  p+=vec3(0.0,0.42,-1.6);',
    '  float edge=inv(2.6,3.7,max(abs(g.x),abs(g.y)));',
    '  float hole=smoothstep(0.22,0.55,r);',
    '  al=0.82*edge*hole; z=1.0;',
    '  float side=clamp(gr.x/3.5*0.5+0.5,0.0,1.0);',
    '  c=mix(VIOL,BLUE,smoothstep(0.3,1.6,r));',
    '  c=mix(c,mix(MAG,RED,side),smoothstep(1.8,3.4,r)*0.55);',
    '  c=mix(c,ICE,inv(0.4,1.1,r)*0.75);',
    '  al*=1.0+inv(0.4,1.2,r)*0.8;',
    '}',

    /* 5 — KARA DELİK: girdap ve parlak foton halkası */
    'void sKaraDelik(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float r; float ang;',
    '  z=1.0;',
    '  if(b.w<0.13){',
    '    r=0.56+gs(a.z,a.w)*0.018;',
    '    ang=a.y*TAU+t*1.1;',
    '    c=mix(ICE,CYAN,b.x*0.4); al=0.85;',
    '  } else {',
    // u: 0 = olay ufku, 1 = dış kenar; zamanla azalır → parçacıklar sarmal şeritler boyunca içeri akar
    '    float u=fract(a.x-t*0.035);',
    '    r=0.60+pow(u,0.8)*3.6;',
    '    float lane=floor(a.z*5.0);',
    '    float spread=(b.w<0.55)?gs(a.w,b.z)*0.16:(a.y-0.5)*TAU;',
    '    ang=lane*TAU/5.0+log(r)*2.6-t*0.30+spread;',
    '    c=mix(ICE,BLUE,smoothstep(0.6,1.7,r));',
    '    c=mix(c,VIOL,smoothstep(1.6,3.8,r)*0.55);',
    '    al=mix(1.0,0.32,smoothstep(0.6,3.4,r))*smoothstep(0.0,0.04,u)*inv(0.85,1.0,u);',
    '    z=0.7+0.6*b.x;',
    '  }',
    '  p=vec3(cos(ang)*r, sin(ang)*r, (b.y-0.5)*0.06*r);',
    '  p=rX(p,-0.5);',
    '  p.y+=0.25;',
    '  p*=mix(1.0,uFit,0.6);',
    '}',

    /* 6 — GALAKSİ: eğik disk, sarmal kollar, parlak çekirdek, halkalar */
    'void sGalaksi(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  vec3 q;',
    '  if(b.w<0.12){',
    '    q=vec3(gs(a.x,a.y), gs(a.z,a.w)*0.45, gs(b.x,b.y))*0.11;',
    '    float d=length(q)/0.25;',
    '    c=mix(vec3(1.0,0.95,0.97),MAG,clamp(d,0.0,1.0)*0.8);',
    '    c=mix(c,GOLD,step(0.7,b.z)*0.4);',
    '    al=0.55; z=1.3;',
    '  } else if(b.w<0.78){',
    '    float arm=floor(a.z*2.0);',
    '    float r=0.16+pow(a.x,0.85)*1.7;',
    '    float ang=arm*PI+log(r/0.16)*2.4+gs(b.x,b.y)*0.28+t*0.2/sqrt(r);',
    '    q=vec3(cos(ang)*r, gs(a.y,b.z)*0.03, sin(ang)*r);',
    '    q.xz+=vec2(gs(a.w,b.x), gs(b.y,a.y))*0.06*r;',
    '    c=mix(MAG,VIOL,smoothstep(0.15,0.7,r));',
    '    c=mix(c,BLUE,smoothstep(0.7,1.6,r));',
    '    c=mix(c,ICE,step(0.92,b.z)*0.6);',
    '    al=mix(0.55,0.28,smoothstep(0.2,1.8,r)); z=1.0;',
    '  } else {',
    '    float kk=floor(a.x*3.0);',
    '    float r=0.98+kk*0.33+gs(a.z,a.w)*0.012;',
    '    float ang=a.y*TAU+t*(0.12-kk*0.02);',
    '    q=vec3(cos(ang)*r, (b.x-0.5)*0.01, sin(ang)*r);',
    '    c=mix(BLUE,CYAN,0.4+0.3*kk); al=0.50; z=0.9;',
    '  }',
    '  q=rX(q,0.36); q=rZ(q,-0.10); q.y-=0.05;',
    '  p=q*uFit*1.15;',
    '}',

    /* ARKA YILDIZLAR (her zaman görünür katman) */
    'void sArka(vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  float zz=mix(-9.0,-2.5,a.z); float D=4.2-zz;',
    '  p=vec3((a.x-0.5)*2.3*hh(D)*uAspect, (a.y-0.5)*2.3*hh(D), zz);',
    '  float tw=0.5+0.5*sin(t*(0.6+b.x*2.2)+b.y*TAU);',
    '  al=(0.16+0.55*b.z)*(0.45+0.55*tw*tw);',
    '  z=0.55+0.7*b.z;',
    '  c=mix(ICE,BLUE,b.w*0.7);',
    '  if(a.w>0.985){',
    '    c=mix(BLUE,CYAN,b.x); z=3.0+2.2*b.y; al=0.50+0.35*tw;',
    '    p.x+=sin(t*0.04+a.x*TAU)*0.25; p.y+=cos(t*0.05+a.y*TAU)*0.18;',
    '  } else if(a.w>0.975){ c=GOLD; }',
    '}',

    'void sahne(float id, vec4 a, vec4 b, float t, out vec3 p, out vec3 c, out float z, out float al){',
    '  if(id<0.5) sHalka(a,b,t,p,c,z,al);',
    '  else if(id<1.5) sSarmal(a,b,t,p,c,z,al);',
    '  else if(id<2.5) sYildiz(a,b,t,p,c,z,al);',
    '  else if(id<3.5) sDalga(a,b,t,p,c,z,al);',
    '  else if(id<4.5) sKuyu(a,b,t,p,c,z,al);',
    '  else if(id<5.5) sKaraDelik(a,b,t,p,c,z,al);',
    '  else sGalaksi(a,b,t,p,c,z,al);',
    '}',

    'void main(){',
    '  vec3 p; vec3 c; float z; float al;',
    '  if(uLayer>0.5){',
    '    sArka(aS1,aS2,uTime,p,c,z,al);',
    '  } else {',
    '    sahne(uA,aS1,aS2,uTime,p,c,z,al);',
    '    if(uMix>0.0001){',
    '      vec3 p2; vec3 c2; float z2; float al2;',
    '      sahne(uB,aS1,aS2,uTime,p2,c2,z2,al2);',
    '      float dl=fract(aS1.w*7.31+aS2.x*3.17);',
    '      float e=clamp((uMix-dl*0.42)/0.58,0.0,1.0);',
    '      e=e*e*(3.0-2.0*e);',
    '      float bu=sin(PI*e);',
    '      vec3 dir=normalize(vec3(aS2.y,aS2.z,aS1.z)-0.5+1e-3);',
    '      p=mix(p,p2,e)+dir*bu*(0.25+0.55*fract(aS1.y*5.7));',
    '      p=rY(p,bu*0.45);',
    '      c=mix(c,c2,e); z=mix(z,z2,e); al=mix(al,al2,e)*(1.0+0.25*bu);',
    '    }',
    '    if(fract(aS1.x*31.7+aS2.z*17.3)>0.975){ z*=4.5; al*=0.10; }',
    '  }',
    '  vec3 v=rY(p,uRot.x); v=rX(v,uRot.y);',
    '  v.z-=4.2;',
    '  gl_Position=uProj*vec4(v,1.0);',
    '  float dist=max(-v.z,0.05);',
    '  float sz=uPx*z/dist;',
    '  float A=al*uGain*smoothstep(0.3,1.0,dist);',
    '  if(sz<1.6){ A*=sz/1.6; sz=1.6; }',
    '  gl_PointSize=min(sz,64.0);',
    '  vCol=c; vAl=A;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vCol;',
    'varying float vAl;',
    'void main(){',
    '  vec2 q=gl_PointCoord*2.0-1.0;',
    '  float d2=dot(q,q);',
    '  if(d2>1.0) discard;',
    '  float a=(exp(-d2*9.0)+exp(-d2*3.0)*0.35)*vAl;',
    '  gl_FragColor=vec4(vCol*a, a);',
    '}'
  ].join('\n');

  /* Işıma (bloom) zinciri: tam çözünürlük → 1/4 → 1/8, her seviyede ayrık Gauss bulanıklığı */
  var QVS = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }';
  var DOWN_FS = [
    'precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel;',
    'void main(){',
    '  vec4 s=texture2D(uTex,vUv+uTexel*vec2(-1.0,-1.0))+texture2D(uTex,vUv+uTexel*vec2(1.0,-1.0))',
    '        +texture2D(uTex,vUv+uTexel*vec2(-1.0,1.0))+texture2D(uTex,vUv+uTexel*vec2(1.0,1.0));',
    '  gl_FragColor=s*0.25;',
    '}'
  ].join('\n');
  var BLUR_FS = [
    'precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;',
    'void main(){',
    '  vec2 o1=uDir*1.3846153846; vec2 o2=uDir*3.2307692308;',
    '  vec4 c=texture2D(uTex,vUv)*0.2270270270;',
    '  c+=(texture2D(uTex,vUv+o1)+texture2D(uTex,vUv-o1))*0.3162162162;',
    '  c+=(texture2D(uTex,vUv+o2)+texture2D(uTex,vUv-o2))*0.0702702703;',
    '  gl_FragColor=c;',
    '}'
  ].join('\n');
  var COMP_FS = [
    'precision mediump float; varying vec2 vUv;',
    'uniform sampler2D uBase; uniform sampler2D uB1; uniform sampler2D uB2; uniform float uS1; uniform float uS2;',
    'void main(){',
    '  vec3 c=texture2D(uBase,vUv).rgb+texture2D(uB1,vUv).rgb*uS1+texture2D(uB2,vUv).rgb*uS2;',
    '  c=min(c,vec3(1.0));',
    '  float a=max(c.r,max(c.g,c.b));',
    '  gl_FragColor=vec4(c,a);',
    '}'
  ].join('\n');

  /* ---------------- DURUM ---------------- */
  var gl = null, prog = null, U = {}, A1 = 0, A2 = 1;
  var bufAna = null, bufYildiz = null, bufQuad = null;
  var pDown = null, pBlur = null, pComp = null;
  var hA = null, hD1 = null, hT1 = null, hD2 = null, hT2 = null; // render hedefleri
  var parilti = false;
  var mobil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600;
  var NANA = Math.max(1000, Math.round(mobil ? cfg.mobilParcacikSayisi : cfg.parcacikSayisi));
  var NYIL = Math.max(0, Math.round(cfg.yildizSayisi));
  var cizilenAna = NANA;
  var dpr = Math.min(window.devicePixelRatio || 1, cfg.maksPikselOrani);
  var W = 0, H = 0;
  var proj = new Float32Array(16);
  var calisiyor = false, rafId = 0, sonZaman = 0, zaman = 0;

  var azHareket = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // sahne durum makinesi
  var st = { a: sira[0], b: sira[0], mix: 0, faz: 'bekle', sayac: 0, idx: 0, gecisSure: cfg.gecisSuresi };
  if (sabitSahne !== null) { st.a = st.b = sabitSahne; }
  else if (cfg.girisAnimasyonu && sira[0] !== 2) {
    st.a = 2; st.b = sira[0]; st.faz = 'gecis'; st.sayac = 0; st.gecisSure = 3.2; st.idx = 0; st.giris = true;
  }
  var kaydirmaDeger = 0;
  var testDurumu = null; // _test() ile dondurulmuş durum

  // fare
  var hedefRot = [0, 0], rot = [0, 0];

  /* ---------------- YARDIMCILAR ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function tohumlar(n, seed) {
    var r = mulberry32(seed), arr = new Float32Array(n * 8);
    for (var i = 0; i < arr.length; i++) arr[i] = r();
    return arr;
  }
  function perspektif(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f;
    out[10] = (far + near) * nf; out[11] = -1;
    out[14] = 2 * far * near * nf;
  }
  function derle(tip, kaynak) {
    var s = gl.createShader(tip);
    gl.shaderSource(s, kaynak);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error('Shader derleme hatası: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  /* ---------------- KURULUM ---------------- */
  function programYap(vs, fs, attrs, unis) {
    var p = gl.createProgram();
    gl.attachShader(p, derle(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, derle(gl.FRAGMENT_SHADER, fs));
    for (var n in attrs) gl.bindAttribLocation(p, attrs[n], n);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('Program bağlama hatası: ' + gl.getProgramInfoLog(p));
    }
    var u = {};
    unis.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }

  function glKur() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' })
      || canvas.getContext('experimental-webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
    if (!gl) return false;
    var ana = programYap(VS, FS, { aS1: A1, aS2: A2 },
      ['uTime', 'uA', 'uB', 'uMix', 'uLayer', 'uAspect', 'uFit', 'uGain', 'uPx', 'uRot', 'uProj']);
    prog = ana.p; U = ana.u;

    bufAna = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufAna);
    gl.bufferData(gl.ARRAY_BUFFER, tohumlar(NANA, 20261008), gl.STATIC_DRAW);
    bufYildiz = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufYildiz);
    gl.bufferData(gl.ARRAY_BUFFER, tohumlar(Math.max(NYIL, 1), 7331), gl.STATIC_DRAW);
    bufQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    parilti = cfg.parilti > 0;
    if (parilti) {
      try {
        pDown = programYap(QVS, DOWN_FS, { aPos: 0 }, ['uTex', 'uTexel']);
        pBlur = programYap(QVS, BLUR_FS, { aPos: 0 }, ['uTex', 'uDir']);
        pComp = programYap(QVS, COMP_FS, { aPos: 0 }, ['uBase', 'uB1', 'uB2', 'uS1', 'uS2']);
      } catch (e) { parilti = false; }
    }
    hA = hD1 = hT1 = hD2 = hT2 = null;
    W = 0; H = 0; // hedefler boyutla() içinde kurulsun
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  function hedefYap(eski, w, h) {
    if (eski && eski.w === w && eski.h === h) return eski;
    if (eski) { gl.deleteTexture(eski.tex); gl.deleteFramebuffer(eski.fb); }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); return null; }
    return { tex: tex, fb: fb, w: w, h: h };
  }

  function boyutla() {
    var cw = canvas.clientWidth || window.innerWidth;
    var ch = canvas.clientHeight || window.innerHeight;
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (w !== W || h !== H) {
      W = w; H = h;
      canvas.width = W; canvas.height = H;
      if (gl && parilti) {
        var w1 = Math.max(1, Math.ceil(W / 4)), h1 = Math.max(1, Math.ceil(H / 4));
        var w2 = Math.max(1, Math.ceil(W / 8)), h2 = Math.max(1, Math.ceil(H / 8));
        hA = hedefYap(hA, W, H);
        hD1 = hedefYap(hD1, w1, h1); hT1 = hedefYap(hT1, w1, h1);
        hD2 = hedefYap(hD2, w2, h2); hT2 = hedefYap(hT2, w2, h2);
        if (!(hA && hD1 && hT1 && hD2 && hT2)) parilti = false; // FBO desteklenmiyorsa doğrudan çiz
      }
    }
    if (gl) gl.viewport(0, 0, W, H);
    perspektif(proj, Math.PI / 4, W / H, 0.1, 60);
  }

  function bagla(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(A1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(A2, 4, gl.FLOAT, false, 32, 16);
  }

  /* ---------------- ZAMAN ÇİZELGESİ ---------------- */
  function ilerlet(dt) {
    var yavas = azHareket.matches;
    var bekle = cfg.sahneSuresi * (yavas ? 3 : 1);
    if (testDurumu) { st.a = testDurumu.a; st.b = testDurumu.b; st.mix = testDurumu.mix; return; }
    if (sabitSahne !== null) { st.a = st.b = sabitSahne; st.mix = 0; return; }

    if (cfg.mod === 'kaydirma' && !st.giris) {
      var el = document.scrollingElement || document.documentElement;
      var maks = Math.max(1, el.scrollHeight - window.innerHeight);
      var hedef = Math.min(1, Math.max(0, (window.scrollY || el.scrollTop) / maks)) * (sira.length - 1);
      kaydirmaDeger += (hedef - kaydirmaDeger) * Math.min(1, dt * 5);
      if (sira.length < 2) { st.a = st.b = sira[0]; st.mix = 0; return; }
      var i = Math.min(Math.floor(kaydirmaDeger), sira.length - 2);
      var f = kaydirmaDeger - i;
      var m = Math.min(1, Math.max(0, (f - 0.15) / 0.7));
      st.a = sira[i]; st.b = sira[i + 1]; st.mix = m * m * (3 - 2 * m);
      return;
    }

    st.sayac += dt;
    if (st.faz === 'bekle') {
      st.mix = 0;
      if (sira.length > 1 && st.sayac >= bekle) {
        st.faz = 'gecis'; st.sayac = 0;
        st.gecisSure = cfg.gecisSuresi * (yavas ? 1.5 : 1);
        st.idx = (st.idx + 1) % sira.length;
        st.b = sira[st.idx];
      }
    } else {
      st.mix = Math.min(1, st.sayac / st.gecisSure);
      if (st.mix >= 1) {
        st.a = st.b; st.mix = 0; st.faz = 'bekle'; st.sayac = 0;
        if (st.giris) { st.giris = false; if (cfg.mod === 'kaydirma') kaydirmaDeger = 0; }
      }
    }
  }

  /* ---------------- OTOMATİK KALİTE ---------------- */
  // gerçek (kırpılmamış) kare süreleriyle ölçer; 2 sn ortalama FPS < 45 ise bir kademe düşer
  //   kademe 1: %60 parçacık, en fazla 1.5x çözünürlük | kademe 2: %35 parçacık, 1x | kademe 3: ışıma kapalı
  var olcum = { kare: 0, sure: 0, asama: 0, bekle: 1.0, bitti: false };
  function kaliteAyarla(gercekDt) {
    if (!cfg.otomatikKalite || olcum.bitti) return;
    if (olcum.bekle > 0) { olcum.bekle -= gercekDt; return; }
    olcum.kare++; olcum.sure += gercekDt;
    if (olcum.sure < 2) return;
    var fps = olcum.kare / olcum.sure;
    olcum.kare = 0; olcum.sure = 0; olcum.bekle = 0.4;
    if (fps >= 45) { olcum.bitti = true; return; }
    olcum.asama++;
    if (olcum.asama === 1) { cizilenAna = Math.round(NANA * 0.6); dpr = Math.min(dpr, 1.5); boyutla(); }
    else if (olcum.asama === 2) { cizilenAna = Math.round(NANA * 0.35); dpr = Math.min(dpr, 1); boyutla(); }
    else { parilti = false; olcum.bitti = true; }
  }

  /* ---------------- ÇİZİM ---------------- */
  var dbgEl = null, dbgSay = 0, dbgSure = 0;
  function quadCiz(hedef, program, tex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, hedef ? hedef.fb : null);
    gl.viewport(0, 0, hedef ? hedef.w : W, hedef ? hedef.h : H);
    gl.useProgram(program.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function parcacikCiz() {
    var aspect = W / H;
    gl.useProgram(prog);
    gl.enableVertexAttribArray(A1);
    gl.enableVertexAttribArray(A2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, zaman);
    gl.uniform1f(U.uAspect, aspect);
    var fit = Math.min(1, Math.max(0.4, (3.3137 * aspect) / 3.4)); // dar (dikey) ekranda şekilleri sığdır
    gl.uniform1f(U.uFit, fit);
    gl.uniform1f(U.uPx, H / 0.8284 * 0.020 * (0.75 + 0.25 * fit));
    gl.uniform2f(U.uRot, rot[0], rot[1]);
    gl.uniformMatrix4fv(U.uProj, false, proj);
    if (NYIL > 0) {
      bagla(bufYildiz);
      gl.uniform1f(U.uLayer, 1);
      gl.uniform1f(U.uGain, cfg.parlaklik);
      gl.uniform1f(U.uA, 0); gl.uniform1f(U.uB, 0); gl.uniform1f(U.uMix, 0);
      gl.drawArrays(gl.POINTS, 0, NYIL);
    }
    bagla(bufAna);
    gl.uniform1f(U.uLayer, 0);
    gl.uniform1f(U.uGain, cfg.parlaklik * Math.pow(NANA / cizilenAna, 0.6) * (parilti ? 0.85 : 1.15));
    gl.uniform1f(U.uA, st.a); gl.uniform1f(U.uB, st.b); gl.uniform1f(U.uMix, st.mix);
    gl.drawArrays(gl.POINTS, 0, cizilenAna);
  }

  function ciz() {
    if (!parilti) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      parcacikCiz();
      return;
    }
    // 1) parçacıklar → tam çözünürlüklü doku
    gl.bindFramebuffer(gl.FRAMEBUFFER, hA.fb);
    gl.viewport(0, 0, W, H);
    parcacikCiz();
    // 2) ışıma zinciri
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(A2);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    gl.useProgram(pDown.p); gl.uniform1i(pDown.u.uTex, 0);
    gl.uniform2f(pDown.u.uTexel, 1 / W, 1 / H);
    quadCiz(hD1, pDown, hA.tex);
    gl.useProgram(pBlur.p); gl.uniform1i(pBlur.u.uTex, 0);
    gl.uniform2f(pBlur.u.uDir, 1 / hD1.w, 0); quadCiz(hT1, pBlur, hD1.tex);
    gl.uniform2f(pBlur.u.uDir, 0, 1 / hD1.h); quadCiz(hD1, pBlur, hT1.tex);

    gl.useProgram(pDown.p);
    gl.uniform2f(pDown.u.uTexel, 1 / hD1.w, 1 / hD1.h);
    quadCiz(hD2, pDown, hD1.tex);
    gl.useProgram(pBlur.p);
    gl.uniform2f(pBlur.u.uDir, 1 / hD2.w, 0); quadCiz(hT2, pBlur, hD2.tex);
    gl.uniform2f(pBlur.u.uDir, 0, 1 / hD2.h); quadCiz(hD2, pBlur, hT2.tex);

    // 3) birleştir → ekran
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pComp.p);
    gl.uniform1i(pComp.u.uBase, 0); gl.uniform1i(pComp.u.uB1, 1); gl.uniform1i(pComp.u.uB2, 2);
    gl.uniform1f(pComp.u.uS1, 1.1 * cfg.parilti); gl.uniform1f(pComp.u.uS2, 1.0 * cfg.parilti);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hA.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hD1.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hD2.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  function kare(simdi) {
    if (!calisiyor) return;
    rafId = requestAnimationFrame(kare);
    var gercekDt = sonZaman ? Math.min(1, (simdi - sonZaman) / 1000) : 0.016;
    var dt = Math.min(0.1, gercekDt);
    sonZaman = simdi;
    var hiz = cfg.hiz * (azHareket.matches ? 0.3 : 1);
    if (!testDurumu) {
      zaman += dt * hiz;
      if (zaman > 20000) zaman -= 20000;
    }
    ilerlet(dt);
    var yumus = Math.min(1, dt * 3);
    var fareAcik = cfg.fareEtkisi && !azHareket.matches;
    var sallanma = azHareket.matches ? 0 : 0.035;
    var hx = (fareAcik ? hedefRot[0] : 0) + Math.sin(zaman * 0.11) * sallanma;
    var hy = (fareAcik ? hedefRot[1] : 0) + Math.sin(zaman * 0.083) * sallanma * 0.6;
    rot[0] += (hx - rot[0]) * yumus;
    rot[1] += (hy - rot[1]) * yumus;
    kaliteAyarla(gercekDt);
    ciz();
    if (debug) {
      dbgSay++; dbgSure += gercekDt;
      if (dbgSure >= 0.5) {
        if (!dbgEl) { dbgEl = document.createElement('div'); dbgEl.className = 'kozmik-debug'; document.body.appendChild(dbgEl); }
        dbgEl.textContent = 'FPS ' + Math.round(dbgSay / dbgSure) + '  parçacık ' + cizilenAna + '/' + NANA +
          '  dpr ' + dpr + '\n' + SAHNE_AD[st.a] + (st.mix > 0 ? ' → ' + SAHNE_AD[st.b] + ' ' + Math.round(st.mix * 100) + '%' : '') +
          '  mod ' + cfg.mod;
        dbgSay = 0; dbgSure = 0;
      }
    }
  }

  function baslat() {
    if (calisiyor || !gl) return;
    calisiyor = true; sonZaman = 0;
    rafId = requestAnimationFrame(kare);
  }
  function durdur() {
    calisiyor = false;
    cancelAnimationFrame(rafId);
  }

  /* ---------------- OLAYLAR ---------------- */
  window.addEventListener('resize', boyutla, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(boyutla).observe(canvas);
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var nx = (e.clientX / window.innerWidth) * 2 - 1;
    var ny = (e.clientY / window.innerHeight) * 2 - 1;
    hedefRot[0] = nx * 0.10;
    hedefRot[1] = ny * 0.06;
  }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) durdur(); else baslat();
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); durdur(); }, false);
  canvas.addEventListener('webglcontextrestored', function () {
    try { if (glKur()) { boyutla(); baslat(); } } catch (err) { yedegeGec(err); }
  }, false);

  function yedegeGec(err) {
    durdur();
    canvas.classList.add('kozmik-yedek');
    if (err && window.console) console.warn('[kozmik-bg] WebGL kullanılamadı, statik arka plana geçildi:', err.message || err);
  }

  /* ---------------- DIŞ API ---------------- */
  function adIdx(n) {
    var id = typeof n === 'number' ? n : SAHNE_ID[String(n).toLowerCase()];
    return (id === undefined || id < 0 || id > 6) ? -1 : id;
  }
  window.KozmikArkaPlan = {
    // sahneye geç: KozmikArkaPlan.git('galaksi')  veya  .git(6)
    git: function (n) {
      var id = adIdx(n); if (id < 0) return false;
      sabitSahne = null; testDurumu = null;
      if (st.faz === 'gecis' && st.mix > 0.5) st.a = st.b;
      st.b = id; st.faz = 'gecis'; st.sayac = 0; st.gecisSure = cfg.gecisSuresi; st.giris = false;
      var p = sira.indexOf(id); if (p >= 0) st.idx = p;
      return true;
    },
    duraklat: durdur,
    oynat: baslat,
    mod: function (m) { if (m === 'otomatik' || m === 'kaydirma') { cfg.mod = m; return true; } return false; },
    durum: function () {
      return { a: SAHNE_AD[st.a], b: SAHNE_AD[st.b], mix: +st.mix.toFixed(3), mod: cfg.mod,
               parcacik: cizilenAna, toplam: NANA, dpr: dpr, parilti: parilti, kademe: olcum.asama, webgl: !!gl && !canvas.classList.contains('kozmik-yedek'),
               zaman: +zaman.toFixed(2), calisiyor: calisiyor };
    },
    // test amaçlı: belirli bir anı dondurur. _test(null) ile çıkılır.
    _test: function (a, b, mix, t) {
      if (a === null) { testDurumu = null; return; }
      testDurumu = { a: adIdx(a), b: adIdx(b === undefined ? a : b), mix: mix || 0 };
      if (typeof t === 'number') zaman = t;
    }
  };

  /* ---------------- BAŞLAT ---------------- */
  try {
    if (!glKur()) { yedegeGec(new Error('WebGL desteklenmiyor')); return; }
    boyutla();
    baslat();
  } catch (err) {
    yedegeGec(err);
  }
})();
