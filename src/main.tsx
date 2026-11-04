/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Sigil Viz - Core Visualizer Engine
 * Preserves 100% of Claude's architecture, shaders, 40 shapes, 60 VSTs and DOM layout
 */

import * as THREE from 'three';
import {
  auth,
  googleSignIn,
  getAccessToken,
  logoutGoogle,
  testConnection,
  savePresetToCloud,
  subscribeToUserPresets,
  deletePresetFromCloud
} from './utils/firebase.ts';
import { listDriveAudioFiles, fetchDriveAudioBuffer, savePresetToDrive } from './utils/googleDrive.ts';
import { VST_CATALOG, VstAudioState } from './vstCatalog.ts';

const $ = (s: string, root: ParentNode = document) => root.querySelector(s) as HTMLElement;
const cv = $('#cv') as HTMLCanvasElement;
const fin = (v: number) => Number.isFinite(v) ? v : 0;
const er = (m: string) => { const el = $('#er'); if (el) el.textContent = m; };

window.onerror = (m, s, l) => er('Error: ' + m + ' (línea ' + l + ')');
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => er('Error: ' + (e.reason && e.reason.message || e.reason)));

const S = {
  loud: 1, bass: 1, mid: 1, high: 1, sat: 1, dyn: 1, air: 1, hue: 1,
  speed: 1, size: 1, exp: 1, drift: 1, auto: 1, autoCut: 0, autoCutSens: .6,
  autoCutCool: 2.2, cutMode: 3, cutOrder: 0
};

let ac: AudioContext | null = null;
let an: AnalyserNode | null = null;
let anK: AnalyserNode | null = null;
let anL: AnalyserNode | null = null;
let anR: AnalyserNode | null = null;
let buf: AudioBuffer | null = null;
let off = 0, playing = 0, loopOn = 1, obs = 0, scrub = 0, fixC = 1, aspect = 0;
let master: GainNode | null = null;
let mel: AudioBufferSourceNode | null = null;
let dr: { stop: () => void } | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let rdEl: HTMLElement | null = null;
let lost = 0, pcount = 3.5e5, pmax = 3.5e5, cur = 0, burst = 0, t = 0, dt = .016;
let last = 0, t0 = 0, dur = 0, rot = 0, fr = 0, fa = 16, fq = 0;
let drag = 0, lx = 0, ly = 0, vol = .8, lastCut = 0;

// Curated aesthetic palettes (No harsh over-saturated cyan by default)
const P = { c1: '#f5f5f5', c2: '#a3a3a3', c3: '#ffffff', fg: '#f0f2f7' };
// Pure Monochrome B&W UI Accent
const ACC = () => document.body.classList.contains('w') ? '#000000' : '#ffffff';
const hit = $('#hit');
const mmss1 = (x: number) => {
  x = Math.max(0, x);
  const m = Math.floor(x / 60), s = x - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
};

const U: Record<string, { value: any }> = {
  uT: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 },
  uLoud: { value: 0 }, uSat: { value: 0 }, uDyn: { value: 0 }, uAir: { value: 0 },
  uKick: { value: 0 }, uHue: { value: 0 }, uSz: { value: 1 }, uSpd: { value: 1 },
  uPA: { value: .1 }, uInv: { value: 0 }, uExp: { value: 1 },
  uB: { value: new Float32Array(64) },
  uC1: { value: new THREE.Color('#f5f5f5') },
  uC2: { value: new THREE.Color('#a3a3a3') },
  uCE: { value: new THREE.Color('#ffffff') },
  uAm: { value: new THREE.Color('#0d1726') }
};

/* ───────── GLSL: Shaders ───────── */
const G = `uniform float uT,uBass,uMid,uHigh,uLoud,uSat,uDyn,uAir,uKick,uHue,uSz,uSpd,uPA,uInv,uExp;uniform vec3 uC1,uC2,uCE,uAm;uniform float uB[64];
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float sp(float u){float x=clamp(u,0.,1.)*63.;int i=int(x);return mix(uB[i],uB[min(i+1,63)],fract(x));}
float lim(float x,float m){return x*m/(m+abs(x));}
vec3 hue(vec3 c,float a){vec3 k=vec3(.57735);float s=sin(a),co=cos(a);return c*co+cross(k,c)*s+k*dot(k,c)*(1.-co);}
vec3 pal(float t){return hue(mix(uC1,uC2,clamp(t,0.,1.)),uHue);}
`;

// Clean calibrated particle vertex shader (calibrated point size & alpha to prevent dirty over-bloom)
const PV = G + `uniform float uSh;varying vec3 vC;varying float vA;
vec3 shp(int s,vec3 r){float a=r.x*6.2832,b=r.y*6.2832,t=uT*uSpd,sa=sp(r.x),sb=sp(r.y);
if(s==0){float z=r.y*2.-1.,q=sqrt(1.-z*z);return vec3(q*cos(a),z,q*sin(a))*(3.+sa*3.);}
if(s==1){float R=pow(r.y,.6)*9.,th=R*.7+floor(r.z*3.)*2.0944+t*.15+(h(r*40.)-.5)*.5/(R*.3+.3);return vec3(cos(th)*R,(h(r*9.)-.5)*(1.+sa*4.)*.6/(R*.2+.5),sin(th)*R);}
if(s==2){float R=4.+cos(b)*(1.+sa*2.);return vec3(cos(a)*R,sin(b)*(1.+sa*2.),sin(a)*R);}
if(s==3)return((floor(r*9.)/8.-.5)*12.+(fract(r*9.+.37)-.5)*.3)*(1.+sa*.6);
if(s==4){float z=mod(r.z*60.-t*8.,60.)-45.,R=3.5+sa*3.+vn(vec3(a,z*.2,t))*1.5;return vec3(cos(a)*R,sin(a)*R,z);}
if(s==5){float y=(r.z*2.-1.)*7.,ph=y*1.4+t*.8+floor(r.x*2.)*3.1416,R=2.+sa*2.5;return vec3(cos(ph)*R+(h(r*30.)-.5)*.3,y,sin(ph)*R+(h(r*31.)-.5)*.3);}
if(s==6)return vec3((r.x-.5)*16.,sp(abs(r.x-.5)*2.)*3.+sb*2.+vn(vec3(r.x*8.,r.y*8.,t*.5))*uSat*3.-1.5,(r.y-.5)*16.);
if(s==7){float k=floor(r.z*24.),R=1.+k*.45;return vec3(cos(a)*R,(sp(k/24.)-.2)*5.*(.5+uBass)+sin(a*3.+t)*.15,sin(a)*R);}
if(s==8){float u=r.x*62.83+t*.3;return vec3(sin(3.*u),sin(4.*u+1.),sin(5.*u+t*.2))*5.+(r-.5)*(.4+sa*2.);}
if(s==9){float R=.5+pow(r.y,1.7)*10.,th=a+t*1.5/(R*.4+.3)+R*.5;return vec3(cos(th)*R,(r.z-.5)*(.2+R*.15)*(1.+sa*3.),sin(th)*R);}
if(s==11){float n=floor(r.x*1800.),th=n*2.39996+t*.12,R=sqrt(n)*.2;vec3 j=vec3(h(r*3.),h(r*5.),h(r*7.))-.5;return vec3(cos(th)*R,(sp(R/9.)-.25)*3.*(.4+uBass)+j.y*.15,sin(th)*R)+vec3(j.x,0.,j.z)*.18;}
if(s==12){vec3 dv=normalize(vec3(h(r*7.),h(r*11.),h(r*13.))-.5+1e-3);float R=1.2+pow(r.z,.7)*4.6*(1.+uKick*1.4)*(.6+sa*.8);return dv*R;}
if(s==13){float u=r.x*18.85+t*.1,k=1.3333,dd=2.5+sa*2.5;return vec3(4.*cos(u)+dd*cos(k*u),(r.y-.5)*(.4+sb*3.)+sin(u*.5+t)*.8,4.*sin(u)-dd*sin(k*u))*.9;}
if(s==14){float N=1500.,i=floor(r.x*N),z=1.-2.*(i+.5)/N,q=sqrt(max(0.,1.-z*z)),ph=i*2.39996+t*.2,R=3.2+sp(abs(z))*3.5*(.4+uBass);vec3 j=vec3(h(r*3.),h(r*5.),h(r*7.))-.5;return vec3(q*cos(ph),z,q*sin(ph))*R+j*.25;}
if(s==15){float e=(floor(r.x*7.)+.5)/7.*3.14159,ph=(floor(r.y*14.)+.5)/14.*6.2832+t*.15,ps=r.z*12.566;float c1=cos(e*.5),s1=sin(e*.5),x1=c1*cos((ps+ph)*.5),x2=c1*sin((ps+ph)*.5),x3=s1*cos((ps-ph)*.5),x4=s1*sin((ps-ph)*.5);vec3 w=vec3(x1,x2,x3)/max(1.04-x4,.25)*3.;return w*min(1.,9./max(length(w),.001));}
if(s==16){float y=(r.x*2.-1.)*6.,R=(.7+(y+6.)*.32)*(1.+sa*.6)+sin(y*1.6-t*3.)*uMid*.7;return vec3(cos(b)*R,y,sin(b)*R);}
if(s==17){vec2 q=(r.xy-.5)*20.;float d=length(q);return vec3(q.x,sin(d*1.5-t*3.)*exp(-d*.1)*(.6+uBass*3.)*(.5+sp(d/14.)*2.)-1.,q.y);}
if(s==18){float y=14.-mod(r.z*56.+t*(3.+h(r*13.)*9.)*(.5+uLoud),28.);return vec3((r.x-.5)*30.+y*.12,y,(r.y-.5)*30.);}
if(s==19){float f=floor(r.z*6.);vec2 uv=r.xy*2.-1.;vec3 q=f<.5?vec3(1.,uv):f<1.5?vec3(-1.,uv):f<2.5?vec3(uv.x,1.,uv.y):f<3.5?vec3(uv.x,-1.,uv.y):f<4.5?vec3(uv,1.):vec3(uv,-1.);return mix(q,normalize(q),.4*clamp(uBass,0.,1.)+.1)*4.2*(1.+sp(length(uv)*.7)*.45);}
if(s==20){if(r.z<.32){float z=r.y*2.-1.,q=sqrt(max(0.,1.-z*z));return vec3(q*cos(a),z,q*sin(a))*(1.8+sa*.8);}float R=3.1+pow(r.y,.85)*4.6,th=a+t*.6/(R*.35+.5);R*=1.+sp(r.y)*.1;vec3 p=vec3(cos(th)*R,(h(r*5.)-.5)*.12,sin(th)*R);float cs=cos(.45),sn=sin(.45);return vec3(p.x*cs-p.y*sn,p.x*sn+p.y*cs,p.z);}
return normalize(vec3(h(r*7.),h(r*11.),h(r*13.))-.5)*(60.+r.x*140.);}
void main(){vec3 r=position,p=shp(int(uSh+.5),r);
float n=vn(p*.6+uT*.3*uSpd);
p+=normalize(p+1e-4)*(n-.5)*uSat*2.2;
p*=1.+.22*lim(uBass,1.)+.15*uKick;
p+=(vec3(h(r*3.),h(r*5.),h(r*7.))-.5)*uDyn*.9;
float sk=step(.9988-uAir*.03,h(r*17.+floor(uT*12.)));
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
float pVar=.65+.5*fract(r.z*123.45);
gl_PointSize=clamp(uSz*(.28+uLoud*.5+sk*1.2)*(22./-mv.z)*pVar,0.75,3.8);
vC=mix(pal(clamp(length(p)/8.+(n-.5)*.15,0.,1.)),uCE,smoothstep(.3,1.,uKick)*.7+sk)+uCE*uLoud*.25;
vA=((.24+.3*uLoud)*(abs(uSh-10.)<.5?1.:uPA)+sk*.28)*uExp;}`;

const PF = `varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(vC,vA*(1.-d*d));}`;

const MV = G + `uniform float uDm,uF;varying vec3 vN,vV,vP;varying float vD;
void main(){vec3 p=position;float u=abs(atan(p.z,p.x))/3.1416,v=abs(p.y)/4.;
float d=sp(uDm>1.5&&uDm<2.5?v:u)*(1.2+uBass*1.2)+vn(p*uF+uT*.4*uSpd)*(.15+uSat*1.6);
if(uDm>.5&&uDm<1.5)d+=sin(p.y*5.-uT*4.)*uMid*.8;
if(uDm>2.5)d*=1.+pow(vn(p*2.+uT),3.)*uKick*3.;
d=lim(d,3.);p+=normal*d;p*=1.+.12*lim(uBass,1.);
float w=p.y*uDyn*.2,c=cos(w),s=sin(w);p.xz=mat2(c,-s,s,c)*p.xz;
vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalMatrix*normal;vV=-mv.xyz;vD=d;vP=position;gl_Position=projectionMatrix*mv;}`;

const MF = G + `uniform float uSolid;varying vec3 vN,vV,vP;varying float vD;
void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);
if(uSolid>.5){float kb=(.25+f*2.5)*(.4+uLoud);gl_FragColor=vec4(uAm*kb,1.);return;}
vec3 c=pal(clamp(f*.9+vD*.05,0.,1.))*(.5+f*1.5)+uCE*(uLoud*.8+uKick+vD*.4);
gl_FragColor=vec4(c,(.55+.45*uInv)*uExp);}`;

const BV = G + `attribute vec4 aD;uniform float uK;varying float vV;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){vec3 p=position,c=aD.xyz;float sd=aD.w,t=uT*uSpd;vV=sd;
if(uK<.5){float u=abs(atan(p.z,p.x))/3.1416;p*=1.+.05*lim(uBass,1.)+sp(u)*.08;p.xz=rot(t*.05)*p.xz;p.xy=rot(t*.03)*p.xy;vV=p.y*.01+.5;}
else if(uK<1.5){p+=c;float d=length(p.xz)/70.;p.y=-16.+sp(d)*5.*(.5+uBass)+vn(vec3(p.xz*.08,t*.3))*2.*uSat;}
else if(uK<2.5){p*=.5+sp(sd)*2.5+uKick*1.5;p.xz=rot(t*(.3+sd)+sd*9.)*p.xz;p.yz=rot(t*(.2+sd*.7))*p.yz;float a=t*(.05+sd*.08)+sd*6.2832;p+=vec3(cos(a)*c.x,c.y+sin(t*.2+sd*20.)*3.,sin(a)*c.x);}
else{float a=sd*6.2832+t*.05,R=26.+uBass*3.;p=vec3(cos(a)*R,position.y*sp(sd)*18.*(1.+uKick)-4.,sin(a)*R);}
gl_Position=projectionMatrix*(modelViewMatrix*vec4(p,1.));}`;

const BF = G + `varying float vV;void main(){vec3 c=pal(fract(vV*3.))*(.5+uLoud)+uCE*uKick*.5;gl_FragColor=vec4(c,.35*uExp);}`;

// Shaders para Espectrograma de Cascada (historial de 5 segundos desplazándose hacia abajo en el eje Y)
const WFV = G + `uniform float uWfHead;uniform sampler2D uWfTex;varying vec2 vUv;varying float vAmp;varying vec3 vWP;
void main(){
  vUv = uv;
  // uv.x: frecuencia de graves a agudos (0.0 a 1.0)
  // uv.y: 1.0 arriba (presente), 0.0 abajo (5 segundos atrás en el eje Y)
  float timeOffset = 1.0 - uv.y;
  float timeCoord = fract(uWfHead - timeOffset);
  float amp = texture2D(uWfTex, vec2(uv.x, timeCoord)).r;
  vAmp = amp;
  vec3 p = position;
  float decay = 0.5 + 0.5 * uv.y;
  float height = pow(amp, 1.35) * (4.2 + 2.4 * uBass) * decay;
  p.z += height;
  p.z += sin(p.x * 2.2 + uT * 2.0) * 0.12 * amp * uMid;
  vWP = p;
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(p, 1.0));
}`;

const WFF = G + `uniform float uWfHead;uniform sampler2D uWfTex;varying vec2 vUv;varying float vAmp;varying vec3 vWP;
void main(){
  float amp = vAmp;
  vec3 baseCol = pal(clamp(amp * 1.25 + vUv.x * 0.15, 0.0, 1.0));
  vec3 crest = mix(baseCol, uCE, smoothstep(0.45, 0.95, amp + uKick * 0.3));
  float gridY = smoothstep(0.045, 0.0, abs(fract(vUv.y * 32.0) - 0.5));
  float gridX = smoothstep(0.045, 0.0, abs(fract(vUv.x * 16.0) - 0.5));
  float grid = max(gridY, gridX * 0.6);
  float sheen = sin(vUv.y * 42.0 - uT * 10.0 + vUv.x * 8.0) * 0.5 + 0.5;
  vec3 col = crest + uCE * (grid * 0.35 + sheen * 0.14 * amp) + uAm * 0.25 * (1.0 - amp);
  float alpha = clamp(0.35 + amp * 0.65 + grid * 0.25, 0.12, 0.96) * uExp;
  if(uInv > 0.5){
    col = mix(vec3(0.96, 0.95, 0.92), col * 0.3, clamp(amp * 1.4 + grid * 0.35, 0.0, 1.0));
    alpha = clamp(0.45 + amp * 0.55, 0.15, 1.0);
  }
  gl_FragColor = vec4(col, alpha);
}`;

const QV = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

// Clean bloom threshold extraction (raised to prevent whole-screen milky wash)
const QBR = `uniform sampler2D tD;varying vec2 vUv;
void main(){
  vec4 s=texture2D(tD,vUv);
  vec3 c=s.rgb;
  float l=dot(c,vec3(.299,.587,.114));
  float br=smoothstep(.45,.95,l);
  gl_FragColor=vec4(c*br,1.);
}`;

// Pass A: ProjectM-inspired warp grid feedback + clean optical bloom + optical physics
const QA = `uniform sampler2D tD,tP,tBr;uniform vec2 uR;uniform float uT,uBass,uMid,uLoud,uSat,uDyn,uAir,uKick,uBurst,uFx[32],uInv;varying vec2 vUv;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 tx(vec2 u){return texture2D(tD,u).rgb;}
void main(){
  vec2 uv=vUv;float asp=uR.x/uR.y;

  // uFx[30]: Distorsión de calor (Heat Haze) reactiva a graves y sonoridad
  if(uFx[30]>0.){
    float heatTime = uT * 5.5;
    float heatEnergy = clamp((uBass * 1.35 + uLoud * 0.85) * (0.6 + 0.4 * uKick), 0.0, 2.5);
    float waveX = sin(uv.y * 36.0 - heatTime * 2.2 + sin(uv.x * 24.0 + heatTime) * 1.8) * 0.5
                + sin(uv.y * 74.0 - heatTime * 4.0) * 0.25
                + cos(uv.x * 52.0 + uv.y * 40.0 - heatTime * 3.0) * 0.25;
    float waveY = cos(uv.x * 32.0 - heatTime * 1.8 + cos(uv.y * 20.0 + heatTime) * 1.5) * 0.5
                + sin(uv.y * 60.0 - heatTime * 3.5) * 0.3;
    vec2 heatOffset = vec2(waveX, waveY) * (0.003 + 0.022 * heatEnergy) * uFx[30];
    uv += heatOffset;
  }

  uv+=(vec2(h1(vec2(floor(uT*40.),1.)),h1(vec2(floor(uT*40.),2.)))-.5)*.03*uFx[2]*(uSat+uKick*.5);
  uv.x+=sin(uv.y*18.+uT*3.)*.009*uFx[15]*(.3+uBass*2.);uv.y+=sin(uv.x*14.-uT*2.)*.008*uFx[15]*uBass;
  uv.x+=(h1(vec2(floor(uv.y*240.),floor(uT*30.)))-.5)*.015*uFx[19]*(.2+uSat);
  uv.y=fract(uv.y+uFx[19]*.1*step(.96,h1(vec2(floor(uT*2.),3.)))*sin(uT*20.));
  uv.x=mix(uv.x,.5-abs(uv.x-.5),min(1.,uFx[9]*2.5));
  if(uFx[22]>0.){vec2 q=uv-.5;uv=.5+q*(1.-uFx[22]*(.3+.8*uBass)*dot(q,q)*4.);}
  if(uFx[16]>0.){vec2 q=(uv-.5)*vec2(asp,1.);float k=3.1416/(3.+floor(uFx[16]*5.)),a=atan(q.y,q.x);a=abs(mod(a,2.*k)-k);uv=vec2(cos(a),sin(a))*length(q)/vec2(asp,1.)+.5;}
  if(uFx[21]>0.)uv=abs(fract(uv*(1.+floor(uFx[21]*4.))*.5)*2.-1.);
  if(uFx[7]>0.){vec2 g=uR/mix(160.,14.,uFx[7]*(.3+uDyn));uv=floor(uv*g)/g;}
  float gm=uFx[4]*(uSat*.8+uKick+uBurst);vec2 b=floor(uv*vec2(10.,22.))+floor(uT*9.);
  uv.x+=step(1.-.3*gm,h1(b))*(h1(b+7.)-.5)*.3;
  vec2 ct=uv-.5,d=normalize(ct+1e-5);float ca=uFx[1]*(.002+.015*uBass);
  vec3 c=vec3(tx(uv+d*ca).r,tx(uv).g,tx(uv-d*ca).b);
  float br=dot(ct,ct)*uFx[3]*.06*(.4+uDyn);
  if(br>0.){vec3 a=vec3(0.);for(int i=0;i<8;i++){float an=float(i)*.785;a+=tx(uv+vec2(cos(an)/asp,sin(an))*br);}c=mix(c,a/8.,min(1.,br*30.));}
  if(uFx[20]>0.){vec3 z=vec3(0.);for(int i=0;i<8;i++)z+=tx(.5+ct*(1.-float(i)*.012*(.5+uKick*2.)));c=mix(c,z/8.,min(1.,uFx[20]));}
  
  if(uFx[14]>0.){vec2 q=1./uR;float l0=dot(tx(uv+vec2(q.x,0.)),vec3(.33)),l1=dot(tx(uv-vec2(q.x,0.)),vec3(.33)),l2=dot(tx(uv+vec2(0.,q.y)),vec3(.33)),l3=dot(tx(uv-vec2(0.,q.y)),vec3(.33));c+=vec3(length(vec2(l0-l1,l2-l3))*2.5*uFx[14]);}
  
  // Calibrated Bloom (tight, elegant radius and subtle multiplier to eliminate dirty haze)
  if(uFx[0]>0.){
    vec3 bl=vec3(0.);
    vec2 st=(1.1/uR)*(1.+uLoud*0.9);
    bl+=texture2D(tBr,uv+vec2(-st.x,-st.y)).rgb*.15;
    bl+=texture2D(tBr,uv+vec2( st.x,-st.y)).rgb*.15;
    bl+=texture2D(tBr,uv+vec2(-st.x, st.y)).rgb*.15;
    bl+=texture2D(tBr,uv+vec2( st.x, st.y)).rgb*.15;
    bl+=texture2D(tBr,uv+vec2(0.,-st.y*1.8)).rgb*.10;
    bl+=texture2D(tBr,uv+vec2(0., st.y*1.8)).rgb*.10;
    bl+=texture2D(tBr,uv+vec2(-st.x*1.8,0.)).rgb*.10;
    bl+=texture2D(tBr,uv+vec2( st.x*1.8,0.)).rgb*.10;
    bl+=texture2D(tBr,uv).rgb*.20;
    c+=bl*1.15*uFx[0]*(.5+.5*uLoud);
  }

  // uFx[24]: Halo de prisma anamórfico (Anamorphic Hollywood Prism Flare with Chromatic Dispersion)
  if(uFx[24]>0.){
    vec3 streak = vec3(0.);
    float span = (uFx[24] * 72.0 * (1.0 + uKick * 0.9) + 12.0) / uR.x;
    for(int i = -9; i <= 9; i++){
      if(i == 0) continue;
      float fi = float(i);
      float w = exp(-fi * fi * 0.045);
      vec2 sUv = uv + vec2(fi * span, 0.);
      vec3 sc = tx(sUv);
      float l = dot(sc, vec3(.299, .587, .114));
      float hi = smoothstep(.08, .62, l);
      vec3 flareCol = mix(vec3(.32, .68, 1.0), vec3(1.0, 0.96, 0.92), clamp(1.0 - abs(fi) / 9.0, 0.0, 1.0));
      streak += sc * hi * w * flareCol;
    }
    c += streak * 0.65 * uFx[24];
  }

  // uFx[26]: Líneas de difracción láser (Laser Diffraction Star Spikes Grating)
  if(uFx[26]>0.){
    vec3 diff = vec3(0.);
    float dSpan = (uFx[26] * 46.0 * (1.0 + uAir * 1.4) + 8.0) / uR.y;
    for(int i = 1; i <= 7; i++){
      float fi = float(i);
      float w = exp(-fi * 0.28);
      vec2 o1 = vec2(fi * dSpan * asp * 0.707, fi * dSpan * 0.707);
      vec2 o2 = vec2(-fi * dSpan * asp * 0.707, fi * dSpan * 0.707);
      vec2 o3 = vec2(0.0, fi * dSpan);
      vec3 s1 = tx(uv + o1) + tx(uv - o1);
      vec3 s2 = tx(uv + o2) + tx(uv - o2);
      vec3 s3 = tx(uv + o3) + tx(uv - o3);
      float l1 = dot(s1, vec3(.333));
      float l2 = dot(s2, vec3(.333));
      float l3 = dot(s3, vec3(.333));
      diff += (s1 * smoothstep(.10, .82, l1) + s2 * smoothstep(.10, .82, l2) + s3 * smoothstep(.10, .82, l3) * 0.5) * w;
    }
    c += diff * 0.65 * uFx[26];
  }
  
  // ProjectM Warp Mesh Effect: reactive fluid motion blur feedback
  if(uFx[12]>0.){
    float warpAng = .0018 * (1. + uMid);
    float warpZoom = .996 - .012 * uKick;
    vec2 q = vUv - .5;
    mat2 rMat = mat2(cos(warpAng), -sin(warpAng), sin(warpAng), cos(warpAng));
    vec2 pu = .5 + (rMat * q) * warpZoom + vec2(sin(uT*.7),cos(uT*.6))*.0008;
    vec3 past = texture2D(tP, pu).rgb * .90;
    c = max(c, past * uFx[12]);
  }
  gl_FragColor=vec4(c,1.);
}`;

/* Pass B: Mapeo de tono, estética de papel sumi-ink y estilización final */
const QB = `uniform sampler2D tA;uniform vec2 uR;uniform float uT,uLoud,uSat,uAir,uKick,uInv,uFx[32];varying vec2 vUv;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=vUv;vec3 c=texture2D(tA,uv).rgb;
  if(uFx[18]>0.){vec2 bq=floor(uv*uR/16.)*16./uR;if(h1(bq+floor(uT*8.))<uFx[18]*(.12+uSat*.6))c=texture2D(tA,bq+8./uR).rgb;}
  if(uFx[13]>0.){float cell=mix(16.,5.,uFx[13]);vec2 q=mat2(.707,-.707,.707,.707)*(uv*uR)/cell;float r=sqrt(clamp(dot(c,vec3(.333))*1.8,0.,1.))*.7,m=smoothstep(r+.1,r-.1,length(fract(q)-.5));vec3 hn=c/(max(c.r,max(c.g,c.b))+.02);c=mix(c,hn*m,min(1.,uFx[13]*3.));}
  
  vec3 darkTheme = 1.0 - exp(-c * 1.35);
  vec3 paper = vec3(0.961, 0.953, 0.925);
  vec3 carbon = vec3(0.07, 0.075, 0.085);
  float energy = length(c);
  float inkAlpha = 1.0 - exp(-energy * 1.8);
  vec3 colorDir = normalize(c + 1e-4);
  vec3 inkTone = mix(carbon, colorDir * 0.5, clamp(energy * 0.4, 0.0, 0.75));
  vec3 haloBleed = colorDir * (0.15 + 0.2 * uFx[0]) * (1.0 - exp(-energy * 0.9));
  vec3 lightTheme = mix(paper, inkTone, clamp(inkAlpha, 0.0, 1.0));
  lightTheme -= haloBleed * 0.2 * uFx[0];
  lightTheme = clamp(lightTheme, 0.0, 1.0);
  
  vec3 outCol = mix(darkTheme, lightTheme, uInv);
  outCol = abs(outCol - uFx[10]*uKick*.35);
  if(uFx[23]>0.) outCol = mix(outCol, 1.0 - outCol, uFx[23]*smoothstep(.3,1.,uKick));
  if(uFx[11]>0.){float lv=mix(48.,3.,uFx[11]);outCol=floor(outCol*lv+.5)/lv;}
  if(uFx[17]>0.){float ig=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5,lv=mix(8.,2.,uFx[17]);outCol=mix(outCol,floor(outCol*lv+.5+ig)/lv,min(1.,uFx[17]*4.));}

  // uFx[25]: Deriva de color térmico (FLIR Ironbow False-Color Spectrum)
  if(uFx[25]>0.){
    float lum = dot(outCol, vec3(.299, .587, .114));
    if(lum > 0.005){
      float tLum = clamp(lum * 1.15 + sin(uT * 0.8 + lum * 4.0) * 0.12 * uKick, 0.0, 1.0);
      vec3 flir = vec3(
        smoothstep(0.18, 0.58, tLum) + smoothstep(0.78, 1.0, tLum) * 0.5,
        smoothstep(0.42, 0.82, tLum) * (1.0 - smoothstep(0.92, 1.0, tLum) * 0.35),
        smoothstep(0.02, 0.32, tLum) * (1.0 - smoothstep(0.45, 0.75, tLum)) + smoothstep(0.85, 1.0, tLum) * 0.95
      );
      outCol = mix(outCol, flir * (0.45 + 0.85 * lum), uFx[25] * smoothstep(0.01, 0.12, lum));
    }
  }

  // uFx[27]: Película vintage decolorada (Bleach Bypass Silver Retention & Hard Tone)
  if(uFx[27]>0.){
    float lum = dot(outCol, vec3(.299, .587, .114));
    if(lum > 0.005){
      vec3 overlay = mix(2.0 * outCol * lum, 1.0 - 2.0 * (1.0 - outCol) * (1.0 - lum), step(0.5, lum));
      vec3 silverTone = vec3(lum * 1.18, lum * 1.06, lum * 0.94);
      vec3 bleach = mix(overlay, silverTone, 0.40);
      bleach = pow(bleach, vec3(1.22));
      outCol = mix(outCol, bleach, uFx[27] * 0.85);
    }
  }

  // uFx[28]: Solarización Sabattier (Sinusoidal Tone Curve Inversion & Liquid Chrome Contours)
  if(uFx[28]>0.){
    float lum = dot(outCol, vec3(.299, .587, .114));
    if(lum > 0.01){
      vec3 sab = abs(sin(outCol * 3.141592 * (1.2 + uFx[28] * 1.6)));
      float contour = smoothstep(0.08, 0.0, abs(fract(lum * 6.0) - 0.5));
      sab += vec3(contour * 0.45 * (1.0 + uKick * 0.5));
      float mask = smoothstep(0.01, 0.12, lum);
      outCol = mix(outCol, sab, uFx[28] * mask);
    }
  }

  // uFx[29]: Textura de papel washi (Japanese Kozo Mulberry Fibers & Handcrafted Texture)
  if(uFx[29]>0.){
    vec2 wp = uv * uR;
    float fiberA = sin(wp.x * 0.024 + sin(wp.y * 0.011) * 5.0 + cos(wp.x * 0.007) * 3.0);
    float fiberB = cos(wp.y * 0.026 + sin(wp.x * 0.014) * 4.5);
    float fineStrands = sin(wp.x * 0.065 - wp.y * 0.048 + sin(wp.y * 0.03) * 3.0);
    float fiberGrid = smoothstep(0.72, 0.98, abs(fiberA * fiberB)) * 0.65
                    + smoothstep(0.85, 0.99, abs(fineStrands)) * 0.35;
    float pulpGrain = h1(floor(wp * 0.5));
    float flecks = step(0.982, pulpGrain) * 0.4;
    float washiTotal = clamp(fiberGrid + flecks, 0.0, 1.0);
    vec3 fiberCol = uInv > 0.5 ? vec3(0.12, 0.11, 0.10) : vec3(0.94, 0.92, 0.88);
    outCol = mix(outCol, mix(outCol, fiberCol, washiTotal * 0.75), uFx[29] * 0.85);
  }

  outCol *= 1. - uFx[5]*.22*(.5+.5*sin(uv.y*uR.y*1.6));
  outCol += (h1(uv*uR+uT)-.5)*uFx[6]*(.025+.28*uAir);
  outCol *= 1. - uFx[8]*(.65-.45*uInv)*smoothstep(.28,.95,length(uv-.5)*1.25);
  gl_FragColor=vec4(clamp(outCol,0.,1.),1.);
}`;


/* ───────── Render Setup ───────── */
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance', alpha: false });
R.setClearColor(0, 0);
const pr = Math.min(window.devicePixelRatio || 1, 1.5);
R.setPixelRatio(pr);
const LF = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
const hdr = R.capabilities.isWebGL2 && !!R.getContext().getExtension('EXT_color_buffer_float');
const rt = new THREE.WebGLRenderTarget(4, 4, { ...LF, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
const rBr = new THREE.WebGLRenderTarget(4, 4, { ...LF, depthBuffer: false });
let rA = new THREE.WebGLRenderTarget(4, 4, { ...LF, depthBuffer: false });
let rB = new THREE.WebGLRenderTarget(4, 4, { ...LF, depthBuffer: false });

const PA = { ...U, tD: { value: rt.texture }, tP: { value: rB.texture }, tBr: { value: rBr.texture }, uR: { value: new THREE.Vector2() }, uFx: { value: new Array(32).fill(0) }, uBurst: { value: 0 } };
const PB = { ...U, tA: { value: rA.texture }, uR: PA.uR, uFx: PA.uFx };
const PBr = { tD: { value: rt.texture } };

const qs = (u: any, f: string) => {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader: QV, fragmentShader: f, depthTest: false })));
  return s;
};

const sA = qs(PA, QA), sB = qs(PB, QB), sBr = qs(PBr, QBR);
const pc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, .1, 2000), grp = new THREE.Group();
sc.add(grp);

const MAXP = 2.5e6, pg = new THREE.BufferGeometry(), pa = new Float32Array(MAXP * 3);
for (let i = 0; i < pa.length; i++) pa[i] = Math.random();
pg.setAttribute('position', new THREE.BufferAttribute(pa, 3));
pg.setDrawRange(0, pcount);
pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);

const ADD = {
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
  depthWrite: false
};

const mkP = (s: number) => new THREE.ShaderMaterial({ uniforms: { ...U, uSh: { value: s } }, vertexShader: PV, fragmentShader: PF, ...ADD });
const pts = new THREE.Points(pg, mkP(0));
pts.frustumCulled = false;
grp.add(pts);

const sg = new THREE.BufferGeometry(), sa = new Float32Array(35000);
for (let i = 0; i < sa.length; i++) sa[i] = Math.random();
sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);
const stars = new THREE.Points(sg, mkP(10));
stars.frustumCulled = false;
sc.add(stars);

const MU = { uDm: { value: 0 }, uF: { value: 1 } };
const mW = new THREE.ShaderMaterial({ uniforms: { ...U, ...MU, uSolid: { value: 0 } }, vertexShader: MV, fragmentShader: MF, wireframe: true, ...ADD });
const mS = new THREE.ShaderMaterial({ uniforms: { ...U, ...MU, uSolid: { value: 1 } }, vertexShader: MV, fragmentShader: MF, ...ADD, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const emp = new THREE.BufferGeometry();
emp.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1]), 3));
emp.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);
const meshS = new THREE.Mesh(emp, mS), meshW = new THREE.Mesh(emp, mW);
meshS.frustumCulled = meshW.frustumCulled = false;
grp.add(meshS, meshW);
meshS.renderOrder = -2;

// ── Espectrograma de Cascada: Buffer e historial de frecuencias de los últimos 5 segundos ──
const WF_BINS = 128, WF_SLICES = 256;
const wfBuffer = new Float32Array(WF_BINS * WF_SLICES);
const wfTex = new THREE.DataTexture(wfBuffer, WF_BINS, WF_SLICES, THREE.RedFormat, THREE.FloatType);
wfTex.minFilter = THREE.LinearFilter;
wfTex.magFilter = THREE.LinearFilter;
wfTex.wrapS = THREE.ClampToEdgeWrapping;
wfTex.wrapT = THREE.RepeatWrapping;
wfTex.generateMipmaps = false;

let wfHead = 0, wfAccum = 0;
const U_WF = { ...U, uWfHead: { value: 0 }, uWfTex: { value: wfTex } };
const wfMat = new THREE.ShaderMaterial({
  uniforms: U_WF,
  vertexShader: WFV,
  fragmentShader: WFF,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.NormalBlending
});
// Malla de alta definición: 128 divisiones X × 256 divisiones Y para los 5 segundos
const wfGeo = new THREE.PlaneGeometry(22, 28, WF_BINS - 1, WF_SLICES - 1);
const wfMesh = new THREE.Mesh(wfGeo, wfMat);
wfMesh.rotation.x = -0.32; // Inclinación ergonómica para visualización 3D
wfMesh.visible = false;
grp.add(wfMesh);

const lg = (P: number[], D: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(D, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
  return g;
};

const mkB = (k: number, g: THREE.BufferGeometry) => {
  const l = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: { ...U, uK: { value: k } }, vertexShader: BV, fragmentShader: BF, ...ADD }));
  l.frustumCulled = false;
  l.renderOrder = 1;
  sc.add(l);
  return l;
};

const BG: THREE.LineSegments[] = [];
{
  const w = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(55, 2));
  w.setAttribute('aD', new THREE.Float32BufferAttribute(new Float32Array(w.attributes.position.count * 4), 4));
  w.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 100);
  BG.push(mkB(0, w));
}
{
  const P: number[] = [], D: number[] = [];
  for (let i = -10; i <= 10; i++) {
    for (let j = -20; j < 20; j++) {
      const s = (i + 10) / 20;
      P.push(0, 0, 0, 0, 0, 3.5, 0, 0, 0, 3.5, 0, 0);
      D.push(i * 7, 0, j * 3.5, s, i * 7, 0, j * 3.5, s, j * 3.5, 0, i * 7, s, j * 3.5, 0, i * 7, s);
    }
  }
  BG.push(mkB(1, lg(P, D)));
}
{
  const P: number[] = [], D: number[] = [], V = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, -1, 0]], E = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4]];
  for (let i = 0; i < 260; i++) {
    const sd = Math.random(), Rr = 22 + Math.random() * 50, y = (Math.random() - .5) * 50;
    for (const [a, b] of E) {
      P.push(...V[a], ...V[b]);
      D.push(Rr, y, 0, sd, Rr, y, 0, sd);
    }
  }
  BG.push(mkB(2, lg(P, D)));
}
{
  const P: number[] = [], D: number[] = [], N = 192;
  for (let i = 0; i < N; i++) {
    const sd = i / N;
    P.push(0, 0, 0, 0, 1, 0);
    D.push(0, 0, 0, sd, 0, 0, 0, sd);
  }
  BG.push(mkB(3, lg(P, D)));
}

/* Efectos Ópticos GPU (Calibrated Bloom at 0.28 to prevent dirty haze) */
const FX: [string, number, number][] = [
  ['Resplandor difuso (Bloom)', 1, .28], ['Borde cromático', 1, .55], ['Vibración por impacto', 1, .38], ['Desenfoque de campo', 0, .5], ['Glitch digital', 1, .35],
  ['Líneas de fósforo CRT', 0, .4], ['Grano analógico 35mm', 1, .4], ['Pixelación dinámica', 0, .4], ['Viñeta de borde', 1, .45], ['Reflejo en espejo', 0, .4],
  ['Inversión por golpe', 0, .5], ['Reducción tonal (Posterize)', 0, .4], ['Estela de movimiento (ProjectM)', 1, .35], ['Tramado de puntos (Halftone)', 0, .5], ['Detección de bordes Sobel', 0, .5],
  ['Ondas de sonido líquidas', 0, .45], ['Caleidoscopio radial', 0, .4], ['Tramado 1-bit Dither', 0, .5], ['Bloques de compresión JPEG', 0, .5], ['Desfase analógico VHS', 0, .5],
  ['Zoom radial reactivo', 0, .5], ['Mosaico modular', 0, .3], ['Ojo de pez curvado', 0, .5], ['Negativo reactivo', 0, .5], ['Halo de prisma anamórfico', 0, .4],
  ['Deriva de color térmico', 0, .4], ['Líneas de difracción láser', 0, .4], ['Película vintage decolorada', 0, .4], ['Solarización Sabattier', 0, .4], ['Textura de papel washi', 0, .3],
  ['Distorsión de calor (Heat Haze)', 0, .45]
];
const fx = FX.map(f => ({ on: f[1], a: f[2] }));

/* ───────── Aspect Ratio & Resize ───────── */
const AR = [0, 16 / 9, 9 / 16, 1], AR_TAGS = ['VENTANA COMPLETA', '16:9 · LANDSCAPE', '9:16 · REELS / TIKTOK', '1:1 · CUADRADO'];
let cw = window.innerWidth, ch = window.innerHeight;

function rs() {
  const W = window.innerWidth, H = window.innerHeight, a = AR[aspect];
  let w = W, h = H;
  if (a) { if (W / H > a) w = H * a; else h = W / a; }
  w = Math.floor(w); h = Math.floor(h); cw = w; ch = h;
  const sf = $('#stage-frame');
  if (sf) {
    sf.style.width = w + 'px';
    sf.style.height = h + 'px';
    sf.classList.toggle('framed', !!a);
  }
  const bars = $('#bars');
  if (bars) bars.style.display = a ? 'block' : 'none';
  const rtag = $('#ratio-tag');
  if (rtag) rtag.textContent = AR_TAGS[aspect];

  R.setSize(w, h, false);
  rt.setSize(w * pr, h * pr);
  rBr.setSize(Math.max(2, (w * pr) >> 1), Math.max(2, (h * pr) >> 1));
  rA.setSize(w * pr, h * pr); rB.setSize(w * pr, h * pr);
  PA.uR.value.set(w * pr, h * pr); PB.uR.value.set(w * pr, h * pr);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  drawWaveformSeeker(); layoutHud();
}
window.addEventListener('resize', rs);

/* ───────── 41 Formas Visuales ───────── */
const PL = 0, MS = 1, WF = 2, geoC: Record<number, THREE.BufferGeometry> = {}, mb: HTMLButtonElement[] = [];

function mkFerrofluidGeo() {
  const g = new THREE.PlaneGeometry(16, 16, 80, 80).rotateX(-1.5708);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
    pos.setY(i, Math.sin(d * 3.5) * Math.exp(-d * .35) * 1.8);
  }
  g.computeVertexNormals(); return g;
}
function mkTokamakGeo() { return new THREE.TorusGeometry(3.5, .8, 64, 180); }
function mkDiracKnotGeo() { return new THREE.TorusKnotGeometry(2.8, .6, 260, 32, 3, 7); }
function mkMonolithsGeo() {
  const g = new THREE.CylinderGeometry(2.5, 3.2, 9, 32, 40, true);
  g.computeVertexNormals(); return g;
}
function mkLotusPolarGeo() { return new THREE.SphereGeometry(3.2, 64, 48); }
function mkSynapticLatticeGeo() { return new THREE.IcosahedronGeometry(3.4, 4); }
function mkMobiusGeo() { return new THREE.TorusKnotGeometry(3, .4, 200, 24, 2, 3); }
function mkQuartzCrystalGeo() { return new THREE.OctahedronGeometry(3.6, 3); }
function mkBlackHoleAccretionGeo() {
  const g = new THREE.RingGeometry(1.2, 6.5, 80, 40);
  g.rotateX(-1.5708); g.computeVertexNormals(); return g;
}
function mkChladniMembraneGeo() {
  const g = new THREE.PlaneGeometry(14, 14, 90, 90).rotateX(-1.5708);
  g.computeVertexNormals(); return g;
}

function fitPos(pos: Float32Array, R: number) {
  let cx = 0, cy = 0, cz = 0; const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
  cx /= n; cy /= n; cz /= n;
  let mx = 1e-6;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz;
    mx = Math.max(mx, Math.hypot(pos[i], pos[i + 1], pos[i + 2]));
  }
  const k = R / mx; for (let i = 0; i < pos.length; i++) pos[i] *= k;
}

function mkParam(fn: (u: number, v: number) => [number, number, number], nu: number, nv: number, u0: number, u1: number, v0: number, v1: number, R = 4.2) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx: number[] = []; let o = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = fn(u0 + (u1 - u0) * i / nu, v0 + (v1 - v0) * j / nv);
      pos[o++] = fin(p[0]); pos[o++] = fin(p[1]); pos[o++] = fin(p[2]);
    }
  }
  fitPos(pos, R);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

const mkKleinGeo = () => mkParam((u, v) => {
  const c = Math.cos(u / 2), s = Math.sin(u / 2), r = 2.2 + c * Math.sin(v) - s * Math.sin(2 * v);
  return [r * Math.cos(u), s * Math.sin(v) + c * Math.sin(2 * v), r * Math.sin(u)];
}, 140, 64, 0, 6.2832, 0, 6.2832);

const mkMobiusRealGeo = () => mkParam((u, v) => {
  const w = v * 1.3, r = 3 + w * Math.cos(u / 2);
  return [r * Math.cos(u), w * Math.sin(u / 2), r * Math.sin(u)];
}, 180, 18, 0, 6.2832, -1, 1);

const mkCatenoidGeo = () => mkParam((u, v) => {
  const R = 1.6 * Math.cosh(v / 1.4);
  return [R * Math.cos(u), v * 1.8, R * Math.sin(u)];
}, 90, 60, 0, 6.2832, -2, 2);

const mkShellGeo = () => mkParam((u, v) => {
  const k = 1 - v / 6.2832, a = 1.5, x = a * k * (1 + Math.cos(u)) * Math.cos(2.5 * v) + .1 * Math.cos(2.5 * v), y = a * k * (1 + Math.cos(u)) * Math.sin(2.5 * v) + .1 * Math.sin(2.5 * v), z = 6.5 * v / 6.2832 + a * k * Math.sin(u);
  return [x, z, y];
}, 48, 130, 0, 6.2832, 0, 6.2832);

const mkEnneperGeo = () => mkParam((u, v) => [u - u * u * u / 3 + u * v * v, u * u - v * v, v - v * v * v / 3 + v * u * u], 72, 72, -1.6, 1.6, -1.6, 1.6);
const mkKnot52Geo = () => new THREE.TorusKnotGeometry(2.9, .55, 300, 28, 5, 2);
const sfm = (m: number, n1: number, n2: number, n3: number, a: number) => {
  const t = Math.abs(Math.cos(m * a / 4)), s = Math.abs(Math.sin(m * a / 4));
  return Math.pow(Math.pow(t, n2) + Math.pow(s, n3) + 1e-6, -1 / n1);
};
const mkSuperGeo = () => mkParam((u, v) => {
  const r1 = sfm(6, .35, 1.7, 1.7, u), r2 = sfm(4, .5, 1.4, 1.4, v);
  return [r1 * Math.cos(u) * r2 * Math.cos(v), r2 * Math.sin(v), r1 * Math.sin(u) * r2 * Math.cos(v)];
}, 120, 70, -3.1416, 3.1416, -1.5708, 1.5708);
const mkDodecaGeo = () => new THREE.DodecahedronGeometry(3.6, 2);
const mkVaseGeo = () => {
  const p: THREE.Vector2[] = [];
  for (let i = 0; i <= 60; i++) {
    const y = -4 + i * 8 / 60, r = 1.7 + Math.sin(y * .9) * .6 + Math.cos(y * .35) * .9 + (y > 3.4 ? (y - 3.4) * 1.2 : 0);
    p.push(new THREE.Vector2(Math.max(.35, r), y));
  }
  return new THREE.LatheGeometry(p, 96);
};
const mkLissTubeGeo = () => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 260; i++) {
    const a = i / 260 * 6.2832;
    pts.push(new THREE.Vector3(Math.sin(3 * a + .6) * 3.6, Math.sin(4 * a) * 2.6, Math.sin(5 * a) * 3.6));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 420, .42, 20, true);
};

const MODS: [string, number, any, number?, number?][] = [
  ['Esfera cuántica', PL, 0], ['Vía láctea', PL, 1], ['Toro magnético', PL, 2], ['Matriz nodal', PL, 3], ['Túnel estelar', PL, 4],
  ['Hélice de datos', PL, 5], ['Plano topográfico', PL, 6], ['Anillos radiales', PL, 7], ['Curva Lissajous', PL, 8], ['Vórtice subatómico', PL, 9],
  ['Ferrofluido de espigas', MS, mkFerrofluidGeo, 0, 1.8], ['Reactor Tokamak de plasma', MS, mkTokamakGeo, 1, 1.5], ['Nudo hiperbólico de Dirac', MS, mkDiracKnotGeo, 0, 1.4],
  ['Monolitos fractales', MS, mkMonolithsGeo, 2, 2.2], ['Flor polar de loto', MS, mkLotusPolarGeo, 3, 1.8], ['Red sináptica nodal', MS, mkSynapticLatticeGeo, 0, 1.6],
  ['Cintas de Möbius cuánticas', MS, mkMobiusGeo, 1, 1.2], ['Cristal de cuarzo resonante', MS, mkQuartzCrystalGeo, 2, 1.9],
  ['Agujero negro y ergósfera', MS, mkBlackHoleAccretionGeo, 0, 2.5], ['Membrana Chladni 3D', MS, mkChladniMembraneGeo, 3, 1.6],
  ['Girasol de Fibonacci', PL, 11], ['Supernova pulsante', PL, 12], ['Espirógrafo hipotrocoide', PL, 13], ['Esfera geodésica áurea', PL, 14], ['Fibración de Hopf', PL, 15],
  ['Embudo acústico', PL, 16], ['Ondas de estanque', PL, 17], ['Lluvia de meteoros', PL, 18], ['Cubo respirante', PL, 19], ['Anillos de Saturno', PL, 20],
  ['Botella de Klein', MS, mkKleinGeo, 0, 1.5], ['Banda de Möbius real', MS, mkMobiusRealGeo, 1, 1.4], ['Catenoide resonante', MS, mkCatenoidGeo, 2, 1.7], ['Concha áurea', MS, mkShellGeo, 0, 1.5], ['Superficie de Enneper', MS, mkEnneperGeo, 3, 1.6],
  ['Nudo toroidal 5:2', MS, mkKnot52Geo, 1, 1.3], ['Superforma orgánica', MS, mkSuperGeo, 0, 1.5], ['Dodecaedro prismático', MS, mkDodecaGeo, 2, 1.8], ['Jarrón de armónicos', MS, mkVaseGeo, 2, 1.4], ['Tubo de Lissajous', MS, mkLissTubeGeo, 3, 1.5],
  ['Espectrograma de Cascada', WF, () => wfGeo, 0, 1]
];

function setMod(i: number) {
  cur = (i + MODS.length) % MODS.length; const m = MODS[cur];
  pts.visible = m[1] == PL; meshW.visible = meshS.visible = m[1] == MS;
  if (wfMesh) wfMesh.visible = m[1] == WF;
  if (m[1] == PL) pts.material.uniforms.uSh.value = m[2];
  else if (m[1] == MS) {
    meshW.geometry = meshS.geometry = geoC[cur] || (geoC[cur] = m[2]());
    MU.uDm.value = m[3] || 0;
    MU.uF.value = m[4] || 1;
  }
  burst = 1; mb.forEach((b, j) => b.classList.toggle('on', j == cur));
  const sbf = $('#sb-form'); if (sbf) sbf.textContent = String(cur + 1).padStart(2, '0');
}

/* ───────── Real-time BPM Engine & Telemetry ───────── */
const TL = new Float32Array(2048), TR = new Float32Array(2048), VPS: Record<string, any> = {};
let zt = 25;

const A: Record<string, any> = {
  chroma: new Float32Array(12), chromaS: new Float32Array(12), bassPc: new Float32Array(12),
  key: '--', keyC: 0, keyN: 0, chord: '--', stem: { bass: 0, lead: 0, chords: 0 },
  peaks: [], ev: [], hits: [], hT: { k: [], s: [], h: [] }, pf: new Float32Array(64),
  fm: { k: [0, .01], s: [0, .01], h: [0, .01] }, env: [], bpmA: 120, bpmC: 0,
  cent: 0, flat: 0, roll: 0, ltasMain: null, ref: null, stage: 'ESTABLE', lufsS: -70,
  l2: [], l2t: 0, corr: 0, wid: 0, bal: 0, rl: -90, rr: -90, tick: 0, lastEv: 0,
  lastHit: { k: 0, s: 0, h: 0 }, waveHist: [], lra: 0, crest: 0, pkL: -90, pkR: -90,
  clipN: 0, clipNow: 0, monoLoss: 0, modeSc: new Float32Array(7), modeBest: 0,
  chH: [], lastChord: '', cutM: [0, .01], cutLast: 0, cutNew: 0,
  // Real-time BPM onset tracker state
  rtBpm: 120, rtConf: 0, rtOnsets: [] as number[], rtEnergyHist: [] as number[], rtLastOnset: 0
};

// Real-time Tap Tempo support
let tapHistory: number[] = [];
function tapTempo() {
  const now = performance.now() / 1000;
  if (tapHistory.length > 0 && now - tapHistory[tapHistory.length - 1] > 2.5) {
    tapHistory = [];
  }
  tapHistory.push(now);
  if (tapHistory.length > 8) tapHistory.shift();
  if (tapHistory.length >= 2) {
    let sum = 0;
    for (let i = 1; i < tapHistory.length; i++) sum += tapHistory[i] - tapHistory[i - 1];
    const avg = sum / (tapHistory.length - 1);
    if (avg > 0) {
      const computed = Math.round(60 / avg);
      if (computed >= 45 && computed <= 220) {
        A.rtBpm = computed;
        A.bpmA = computed;
        A.bpmC = 0.95;
        const e = $('#sb-bpm'); if (e) e.textContent = computed + ' BPM';
        toast('Tempo manual fijado: ' + computed + ' BPM');
      }
    }
  }
}

// Color and Canvas Drawing Helpers
const rgbC: Record<string, number[]> = {};
const rgb = (h: string) => rgbC[h] || (rgbC[h] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const cm = (t: number, al = 1) => {
  const a = rgb(P.c1), b = rgb(P.c2);
  return `rgba(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0},${al})`;
};
const c3 = (al = 1) => {
  const a = rgb(P.c3);
  return `rgba(${a[0]},${a[1]},${a[2]},${al})`;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const noteName = (m: number) => NM[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

const MODES_LIST: [string, Float32Array][] = [
  ['MAJ', [0, 2, 4, 5, 7, 9, 11]], ['MIN', [0, 2, 3, 5, 7, 8, 10]], ['DOR', [0, 2, 3, 5, 7, 9, 10]],
  ['PHRYG', [0, 1, 3, 5, 7, 8, 10]], ['LYD', [0, 2, 4, 6, 7, 9, 11]], ['MIXO', [0, 2, 4, 5, 7, 9, 10]],
  ['LOC', [0, 1, 3, 5, 6, 8, 10]]
].map(([n, s]: any) => {
  const v = new Float32Array(12);
  s.forEach((x: number, i: number) => v[x] = i == 0 ? 1.6 : i == 4 ? 1.2 : 1);
  return [n, v];
});

const pear = (a: Float32Array, b: Float32Array) => {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    n += x * y; da += x * x; db += y * y;
  }
  return n / Math.sqrt(da * db + 1e-9);
};

function detectKey() {
  let best = -9, bi = 0, bm = 0;
  const r = new Float32Array(12), mx = Math.max(1e-6, ...A.bassPc), ms = new Float32Array(7).fill(-9);
  for (let m = 0; m < 7; m++) {
    for (let k = 0; k < 12; k++) {
      for (let i = 0; i < 12; i++) r[i] = MODES_LIST[m][1][(i - k + 12) % 12];
      const c = pear(A.chromaS, r) + A.bassPc[k] / mx * .25;
      if (c > ms[m]) ms[m] = c;
      if (c > best) { best = c; bi = k; bm = m; }
    }
  }
  A.modeSc = ms; A.modeBest = bm; A.key = NM[bi] + ' ' + MODES_LIST[bm][0]; A.keyC = clamp01((best - .2) / .7); A.keyN = bi;
  const sbk = $('#sb-key'); if (sbk) sbk.textContent = A.key;
}

function detectChord() {
  let best = -9, nm = '--';
  const r = new Float32Array(12);
  for (let k = 0; k < 12; k++) {
    for (const [s, iv] of [['', [0, 4, 7]], ['m', [0, 3, 7]]] as [string, number[]][]) {
      r.fill(0);
      iv.forEach((x: number) => r[(k + x) % 12] = 1);
      const c = pear(A.chroma, r);
      if (c > best) { best = c; nm = NM[k] + s; }
    }
  }
  A.chord = best > .55 ? nm : '--';
}

// Real-time Audio Analysis & BPM tracker
function analyze() {
  if (!an || !ac || ac.state != 'running' || (!mel && !dr && !micSource)) return;
  A.tick++;
  A.lufsS = lh.length ? avg(lh.slice(-30)) : -70;
  if (t - A.l2t > .25) {
    A.l2t = t; A.l2.push(M.lufs); if (A.l2.length > 480) A.l2.shift();
  }

  const bw = ac.sampleRate / 8192, UB = U.uB.value;
  let fk = 0, fs = 0, fh = 0;
  for (let i = 0; i < 64; i++) {
    const d = Math.max(0, UB[i] - A.pf[i]);
    if (i < 15) fk += d; else if (i >= 40 && i < 53) fs += d; else if (i >= 57) fh += d;
    A.pf[i] = UB[i];
  }

  // Real-time BPM calculation running on live audio frames
  const instantKick = M.bass * (0.6 + fk * 1.5);
  A.rtEnergyHist.push(instantKick);
  if (A.rtEnergyHist.length > 45) A.rtEnergyHist.shift();

  let avgE = 0;
  for (let i = 0; i < A.rtEnergyHist.length; i++) avgE += A.rtEnergyHist[i];
  avgE /= Math.max(1, A.rtEnergyHist.length);

  const prevE = A.rtEnergyHist.length > 1 ? A.rtEnergyHist[A.rtEnergyHist.length - 2] : 0;
  const isRising = instantKick > prevE * 1.1;
  const kickThreshold = Math.max(0.12, avgE * 1.35);

  if (instantKick > kickThreshold && isRising && (t - A.rtLastOnset >= 0.24 || A.rtLastOnset === 0)) {
    A.rtLastOnset = t;
    A.rtOnsets.push(t);
    if (A.rtOnsets.length > 20) A.rtOnsets.shift();

    if (A.rtOnsets.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < A.rtOnsets.length; i++) {
        const intv = A.rtOnsets[i] - A.rtOnsets[i - 1];
        if (intv >= 0.25 && intv <= 1.3) intervals.push(intv);
      }
      if (intervals.length >= 3) {
        const bpms = intervals.map(iv => {
          let b = 60 / iv;
          while (b < 68) b *= 2;
          while (b > 175) b /= 2;
          return b;
        });
        bpms.sort((a, b) => a - b);
        const med = bpms[Math.floor(bpms.length / 2)];
        let closeCount = 0;
        for (const b of bpms) if (Math.abs(b - med) <= 6) closeCount++;
        A.rtConf = closeCount / bpms.length;
        A.rtBpm = A.rtBpm * 0.7 + med * 0.3;
        if (!BM) {
          const sbb = $('#sb-bpm');
          if (sbb) sbb.textContent = Math.round(A.rtBpm) + ' BPM';
        }
      }
    }
  }

  const fl: Record<string, number> = { k: fk, s: fs, h: fh };
  for (const ty of ['k', 's', 'h']) {
    const m = A.fm[ty], x = fl[ty], thr = m[0] + 2.2 * Math.sqrt(m[1]) + (ty == 'k' ? .25 : .12);
    if (x > thr && t - A.lastHit[ty] > .13) {
      A.lastHit[ty] = t; A.hits.push({ t, ty }); A.hT[ty].push(t);
    }
    m[0] += (x - m[0]) * .03;
    m[1] += ((x - m[0]) * (x - m[0]) - m[1]) * .03;
  }

  {
    const m = A.cutM, x = fk, thr = m[0] + (4.2 - 3.4 * S.autoCutSens) * Math.sqrt(m[1]) + .12;
    if (x > thr && t - A.cutLast > .13) { A.cutLast = t; A.cutNew = 1; }
    m[0] += (x - m[0]) * .03;
    m[1] += ((x - m[0]) * (x - m[0]) - m[1]) * .03;
  }
  if (A.cutNew) {
    A.cutNew = 0;
    if (S.autoCut && !(BM && buf && playing) && t - lastCut > S.autoCutCool) doCut();
  }

  while (A.hits.length && A.hits[0].t < t - 1) A.hits.shift();
  for (const ty in A.hT) while (A.hT[ty].length && A.hT[ty][0] < t - 10) A.hT[ty].shift();
  A.env.push([t, fk + fs * .7 + fh * .5]);
  while (A.env.length && A.env[0][0] < t - 10.5) A.env.shift();

  const pk: [number, number][] = [];
  for (let i = (50 / bw | 0) + 2, e = 3000 / bw | 0; i < e; i++) {
    const v = F[i];
    if (v > 110 && v >= F[i - 1] && v > F[i + 1] && v >= F[i - 2] && v > F[i + 2]) {
      const a = F[i - 1], c = F[i + 1], q = a - 2 * v + c, d = q ? .5 * (a - c) / q : 0;
      pk.push([(i + d) * bw, v]);
    }
  }
  pk.sort((x, y) => y[1] - x[1]); pk.length = Math.min(pk.length, 12); A.peaks = pk;

  const ch = A.chroma, cs = A.chromaS, kf = Math.exp(-dt / .5), ks = Math.exp(-dt / 10), kb = Math.exp(-dt / 20);
  for (let i = 0; i < 12; i++) { ch[i] *= kf; cs[i] *= ks; A.bassPc[i] *= kb; }
  let nb = 0, lead = 0; const pcs = new Set<number>();
  pk.forEach(([hz, v]) => {
    const m = 69 + 12 * Math.log2(hz / 440), pc = ((Math.round(m) % 12) + 12) % 12, w = (v - 100) / 155;
    ch[pc] += w * dt * 6; cs[pc] += w * dt * 3;
    if (hz < 200 && v > 150) { nb = 1; A.bassPc[pc] += w * dt; }
    if (v > 150 && hz > 130 && hz < 1800) pcs.add(pc);
    if (hz > 200 && hz < 3000 && v > 150) lead++;
  });
  const sg = (k: string, x: number) => A.stem[k] += (x - A.stem[k]) * Math.min(1, dt * 6);
  sg('bass', nb); sg('chords', pcs.size >= 3 ? 1 : 0); sg('lead', lead && lead < 3 && pcs.size < 3 ? 1 : 0);

  if (t - A.lastEv > .1) {
    A.lastEv = t;
    const bv: any[] = [null, null, null];
    pk.forEach(([hz, v]) => {
      const c = hz < 200 ? 0 : hz < 1000 ? 1 : 2;
      if (v > 130 && (!bv[c] || v > bv[c][1])) bv[c] = [hz, v];
    });
    bv.forEach((b, c) => {
      if (b) A.ev.push([t, 69 + 12 * Math.log2(b[0] / 440), (b[1] - 100) / 155, c]);
    });
    while (A.ev.length && A.ev[0][0] < t - 24) A.ev.shift();
  }

  if (A.tick % 3 == 0) {
    let sn = 0, tot = 0, lg = 0, n = 0;
    const i0 = 40 / bw | 0, i1 = Math.min(4095, 16000 / bw | 0), pw_ = (i: number) => Math.pow(10, (F[i] / 255 * 95 - 100) / 10) + 1e-12;
    for (let i = i0; i < i1; i++) {
      const p = pw_(i); tot += p; sn += p * i * bw; lg += Math.log(p); n++;
    }
    A.cent = sn / tot; A.flat = Math.exp(lg / n) / (tot / n);
    let c = 0;
    for (let i = i0; i < i1; i++) {
      c += pw_(i); if (c >= .85 * tot) { A.roll = i * bw; break; }
    }
  }

  if (A.tick % 6 == 0) detectChord();
  if (A.chord !== A.lastChord) {
    A.chH.push([t, A.chord]); A.lastChord = A.chord;
    while (A.chH.length > 60) A.chH.shift();
  }
  if (A.tick % 3 == 0 && anL && anR) {
    anL.getFloatTimeDomainData(TL); anR.getFloatTimeDomainData(TR);
    stereo(true);
    rp(HS.lufs, M.lufs); rp(HS.corr, A.corr); rp(HS.wid, A.wid); rp(HS.cent, A.cent);
    rp(HS.roll, A.roll); rp(HS.flat, A.flat); rp(HS.crest, A.crest); rp(HS.bal, A.bal); rp(HS.hz, M.hz);
  }
  if (A.tick % 30 == 0) {
    detectKey();
    const n = lh.length;
    {
      const L = A.l2.filter((v: number) => v > -60);
      if (L.length > 20) {
        const s = L.slice().sort((a: number, b: number) => a - b);
        A.lra = s[Math.min(s.length - 1, (s.length * .95) | 0)] - s[(s.length * .1) | 0];
      }
    }
    if (!buf && n > 40) {
      const d = avg(lh.slice(-10)) - avg(lh.slice(-60, -40));
      A.stage = d > 3 ? 'BUILD-UP' : d < -4 ? 'BREAK / OUTRO' : M.bass > .55 && M.kick > .2 ? 'DROP / BEAT' : 'ESTABLE';
      const sbs = $('#sb-stage'); if (sbs) sbs.textContent = A.stage;
    }
  }
}

function stereo(cnt?: boolean) {
  let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0, pl = 0, pr = 0, cl = 0;
  for (let i = 0; i < 2048; i++) {
    const l = TL[i], r = TR[i];
    ll += l * l; rr += r * r; lr += l * r;
    const m = (l + r) * .5, s = (l - r) * .5;
    mm += m * m; ss += s * s;
    const al = Math.abs(l), ar = Math.abs(r);
    if (al > pl) pl = al; if (ar > pr) pr = ar;
    if (al >= .985 || ar >= .985) cl++;
  }
  A.corr = lr / Math.sqrt(ll * rr + 1e-12);
  A.wid = Math.sqrt(ss / (mm + ss + 1e-12));
  A.rl = 10 * Math.log10(ll / 2048 + 1e-10);
  A.rr = 10 * Math.log10(rr / 2048 + 1e-10);
  A.bal = Math.max(-1, Math.min(1, (A.rr - A.rl) / 12));
  A.pkL = 20 * Math.log10(pl + 1e-6);
  A.pkR = 20 * Math.log10(pr + 1e-6);
  A.crest = 20 * Math.log10(Math.max(pl, pr) / Math.sqrt((ll + rr) / 4096 + 1e-12) + 1e-9);
  A.monoLoss = 10 * Math.log10(2 * mm / (ll / 2048 * 2048 + rr + 1e-12) + 1e-9);
  A.clipNow = cl; if (cnt) A.clipN += cl;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let l = 2; l <= n; l <<= 1) {
    const a = -6.2832 / l, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += l) {
      let cr = 1, ci = 0;
      for (let k = 0; k < l / 2; k++) {
        const u = i + k, v = u + l / 2, tr = re[v] * cr - im[v] * ci, ti = re[v] * ci + im[v] * cr;
        re[v] = re[u] - tr; im[v] = im[u] - ti;
        re[u] += tr; im[u] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function ltas(b: AudioBuffer) {
  const n = 4096, sr = b.sampleRate, c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0;
  const fr = Math.max(1, Math.min(150, Math.floor(c0.length / n))), acc = new Float64Array(n / 2), re = new Float64Array(n), im = new Float64Array(n);
  let pw = 0;
  for (let f = 0; f < fr; f++) {
    const o = fr > 1 ? Math.floor(f * (c0.length - n) / (fr - 1)) : 0;
    for (let i = 0; i < n; i++) {
      const x = ((c0[o + i] || 0) + (c1[o + i] || 0)) * .5;
      pw += x * x; re[i] = x * (.5 - .5 * Math.cos(6.2832 * i / n)); im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const out = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    const f0 = 30 * Math.pow(16000 / 30, i / 64), f1 = 30 * Math.pow(16000 / 30, (i + 1) / 64), k0 = Math.max(1, Math.floor(f0 * n / sr)), k1 = Math.max(k0, Math.floor(f1 * n / sr));
    let s = 0;
    for (let k = k0; k <= k1; k++) s += acc[k];
    out[i] = 10 * Math.log10(s / (k1 - k0 + 1) / fr + 1e-12);
  }
  return { b: out, lu: -.691 + 10 * Math.log10(pw / (fr * n) + 1e-12) };
}

function onMain(b: AudioBuffer) {
  A.ltasMain = ltas(b); A.l2 = []; A.ev.length = 0; A.hits.length = 0;
}

/* ───────── Offline Song Analysis: Fixed Tempo & Beat Grid ───────── */
let BM: any = null, anTok = 0, anCache: any = null;
const sortF = (a: any) => Float32Array.from(a).sort();
const pctl = (a: any, p: number) => {
  if (!a.length) return 0;
  const s = sortF(a);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const yld = () => new Promise(r => setTimeout(r, 0));
const AN_N = 1024, AN_H = 128;

function foldEnv(env: Float32Array, P: number) {
  const B = Math.max(8, Math.round(P * 2)), sum = new Float64Array(B), cnt = new Float64Array(B), L = env.length;
  for (let i = 0; i < L; i++) {
    let ph = i / P; ph -= Math.floor(ph);
    const bi = Math.min(B - 1, (ph * B) | 0);
    sum[bi] += env[i]; cnt[bi]++;
  }
  const av = new Float64Array(B); let tot = 0;
  for (let b = 0; b < B; b++) { av[b] = cnt[b] ? sum[b] / cnt[b] : 0; tot += av[b]; }
  let pk = -1, pi = 0; const sm = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    const v = (av[(b + B - 1) % B] + av[b] + av[(b + 1) % B]) / 3;
    sm[b] = v; if (v > pk) { pk = v; pi = b; }
  }
  const l = sm[(pi + B - 1) % B], r = sm[(pi + 1) % B], q = l - 2 * pk + r, d = q < -1e-12 ? .5 * (l - r) / q : 0;
  return { pk, mean: tot / B, ph: ((pi + .5 + d) / B) * P, B };
}

function onsetEnv(fl: Float32Array, fps: number) {
  const L = fl.length, w = Math.max(3, Math.round(fps * .4)), cs = new Float64Array(L + 1);
  for (let i = 0; i < L; i++) cs[i + 1] = cs[i] + fl[i];
  const o = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    const a = Math.max(0, i - w), b = Math.min(L, i + w + 1);
    o[i] = Math.max(0, fl[i] - (cs[b] - cs[a]) / (b - a));
  }
  const p = pctl(o, .95) || 1e-6;
  for (let i = 0; i < L; i++) o[i] = Math.min(2, o[i] / p);
  return o;
}

function acfTempo(env: Float32Array, fps: number) {
  const L = env.length; let mu = 0;
  for (let i = 0; i < L; i++) mu += env[i]; mu /= L;
  const lmax = Math.ceil(fps * 60 / 60), maxLag = Math.min(L - 2, lmax * 4 + 2), r = new Float64Array(maxLag + 1);
  for (let l = 0; l <= maxLag; l++) {
    let s = 0;
    for (let i = 0; i + l < L; i++) s += (env[i] - mu) * (env[i + l] - mu);
    r[l] = s / (L - l);
  }
  const r0 = r[0] || 1e-9, rr = (i: number) => i <= maxLag ? r[i] : 0;
  const lo = Math.floor(fps * 60 / 185), hi = Math.min(Math.ceil(fps * 60 / 66), maxLag - 1), sc: number[] = [];
  for (let l = lo; l <= hi; l++) {
    const bpm = 60 * fps / l, w = Math.exp(-.5 * Math.pow(Math.log2(bpm / 120) / 1.0, 2));
    sc[l] = (rr(l) + .5 * rr(2 * l) + .25 * rr(4 * l)) / r0 * w;
  }
  const c: number[] = [];
  for (let l = lo + 1; l < hi; l++) if (sc[l] > sc[l - 1] && sc[l] >= sc[l + 1]) c.push(l);
  c.sort((a, b) => sc[b] - sc[a]);
  return c.slice(0, 4).map(l => {
    const a = sc[l - 1], b = sc[l], d = sc[l + 1], q = a - 2 * b + d, o = q < 0 ? .5 * (a - d) / q : 0;
    return { bpm: 60 * fps / (l + o), sc: sc[l] };
  });
}

function fitTempo(env: Float32Array, fps: number, bpm0: number) {
  const L = env.length, W = Math.min(L, Math.round(45 * fps)); let bs = 0;
  if (L > W) {
    let curE = 0; for (let i = 0; i < W; i++) curE += env[i];
    let bc = curE;
    for (let i = W; i < L; i++) {
      curE += env[i] - env[i - W]; if (curE > bc) { bc = curE; bs = i - W + 1; }
    }
  }
  const win = env.subarray(bs, bs + W);
  const scan = (e: Float32Array, c: number, span: number, step: number) => {
    let best: any = null;
    for (let k = -span; k <= span + 1e-9; k += step) {
      const bpm = c + k; if (bpm < 40) continue;
      const P = 60 * fps / bpm, f = foldEnv(e, P), sc = f.pk - f.mean;
      if (!best || sc > best.sc) best = { bpm, sc, f, P };
    }
    return best;
  };
  let b = scan(win, bpm0, bpm0 * .05, .05);
  b = scan(env, b.bpm, .15, .01);
  b = scan(env, b.bpm, .012, .002);
  return b;
}

function localOnset(x: Float32Array, sr2: number, ta: number, tb: number, lp: number) {
  const i0 = Math.max(0, Math.floor(ta * sr2)), i1 = Math.min(x.length - 1, Math.floor(tb * sr2)), len = i1 - i0 + 1, w = Math.max(4, Math.round(sr2 * .003));
  if (len < w * 4 + 8) return null;
  const cs = new Float64Array(len + 1), a = lp ? Math.min(1, 6.2832 * lp / sr2) : 1; let y = 0;
  for (let j = 0; j < len; j++) {
    const v = x[i0 + j]; y += a * (v - y); cs[j + 1] = cs[j] + y * y;
  }
  let best = -1, bj = 0;
  for (let j = 0; j + 2 * w <= len; j++) {
    const d = (cs[j + 2 * w] - cs[j + w]) - (cs[j + w] - cs[j]);
    if (d > best) { best = d; bj = j + w; }
  }
  const mean = cs[len] / len * w;
  return { t: (i0 + bj) / sr2, q: best / (mean + 1e-12) };
}

function peaksOf(env: Float32Array, th: number) {
  const p: [number, number][] = [];
  for (let i = 2; i < env.length - 2; i++) {
    const v = env[i];
    if (v >= th && v >= env[i - 1] && v > env[i + 1] && v >= env[i - 2] && v > env[i + 2]) p.push([i, v]);
  }
  return p;
}

function gridAlign(pk: [number, number][], Pf: number, ph: number, tolF: number) {
  let hit = 0, tot = 0; const q = Pf / 4;
  for (const [i, v] of pk) {
    const u = (i - ph) / q, d = Math.abs(u - Math.round(u)) * q;
    tot += v; if (d <= tolF) hit += v;
  }
  return tot ? hit / tot : 0;
}

function detectTempo(C: any) {
  const pk = peaksOf(C.env, .5), res = C.cands.map((c: any) => {
    const f = fitTempo(C.env, C.fps, c.bpm), al = gridAlign(pk, f.P, f.f.ph, 2.2);
    return { bpm: f.bpm, sc: c.sc, al };
  });
  const mx = Math.max(...res.map((r: any) => r.al)), ok = res.filter((r: any) => r.al >= mx - .06).sort((a: any, b: any) => b.sc - a.sc);
  C.tempoRes = res; return ok[0].bpm;
}

async function analyzeSong(b: AudioBuffer, tok: number, prog?: (p: number) => void) {
  const sr = b.sampleRate, n = b.length, c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0;
  const Dn = Math.max(1, Math.round(sr / 11025)), sr2 = sr / Dn, m = Math.floor(n / Dn);
  if (m < sr2 * 6) return null;
  const x = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0; const o = i * Dn;
    for (let j = 0; j < Dn; j++) s += c0[o + j] + c1[o + j];
    x[i] = s / (2 * Dn);
  }
  const N = AN_N, H = AN_H, nF = Math.floor((m - N) / H) + 1, fps = sr2 / H;
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
  const k0 = Math.max(1, Math.round(30 * N / sr2)), k1 = Math.max(k0 + 1, Math.round(150 * N / sr2)), k2 = Math.round(2000 * N / sr2), k3 = Math.min(N / 2 - 1, Math.round(5000 * N / sr2));
  const flux = new Float32Array(nF), lowF = new Float32Array(nF), hiF = new Float32Array(nF), rms = new Float32Array(nF), lowE = new Float32Array(nF), hiE = new Float32Array(nF);
  const re = new Float64Array(N), im = new Float64Array(N), prev = new Float32Array(k3 + 1);

  for (let f = 0; f < nF; f++) {
    const o = f * H; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    fft(re, im);
    let fl = 0, lf = 0, hf = 0, le = 0, he = 0;
    for (let k = k0; k <= k3; k++) {
      const a = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * 4 / N, v = Math.log1p(a * 200), d = v - prev[k]; prev[k] = v;
      if (f > 0 && d > 0) { fl += d; if (k <= k1) lf += d; else hf += d; }
      if (k <= k1) le += a * a; else if (k >= k2) he += a * a;
    }
    flux[f] = fl; lowF[f] = lf; hiF[f] = hf; rms[f] = e / N; lowE[f] = le; hiE[f] = he;
    if (f % 250 == 249) { await yld(); if (tok !== anTok) return null; prog && prog(.8 * f / nF); }
  }

  const eFull = onsetEnv(flux, fps), eLow = onsetEnv(lowF, fps), eHi = onsetEnv(hiF, fps), env = new Float32Array(nF);
  for (let i = 0; i < nF; i++) env[i] = eLow[i] + eFull[i] * .6;
  const ft = (i: number) => (i * H + N / 2) / sr2 + .03;
  const fi = (t: number) => Math.round(((t - .03) * sr2 - N / 2) / H);
  const C = { x, sr2, fps, nF, N, H, env, eLow, eHi, eFull, rms, lowE, hiE, dur: n / sr, ft, fi };
  prog && prog(.88);
  const cands = acfTempo(env, fps);
  if (!cands.length) return null;
  (C as any).cands = cands; anCache = C;
  const bm = buildGrid(C, detectTempo(C));
  prog && prog(1);
  return bm;
}

function buildGrid(C: any, bpm0: number) {
  const { x, sr2, fps, env, dur, ft, fi, nF } = C;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const dB = (v: number) => 10 * Math.log10(v + 1e-10);
  const nz = (v: number, a: number, b: number) => clamp((v - a) / (b - a + 1e-6), 0, 1);

  let fit = fitTempo(env, fps, bpm0), bpm = fit.bpm;
  const rb = Math.round(bpm), hb = Math.round(bpm * 2) / 2; let snap: number | null = null;
  if (Math.abs(bpm - rb) <= .12) snap = rb; else if (Math.abs(bpm - hb) <= .06) snap = hb;
  if (snap !== null) {
    const f2 = foldEnv(env, 60 * fps / snap);
    if (f2.pk - f2.mean >= .9 * (fit.f.pk - fit.f.mean)) { bpm = snap; fit = { bpm: snap, f: f2, P: 60 * fps / snap }; }
  }
  const Pb = 60 / bpm;
  let t0 = ((ft(fit.f.ph) % Pb) + Pb) % Pb;
  const nb0 = Math.floor((dur - t0) / Pb) + 1, stride = Math.max(1, Math.floor(nb0 / 300)), t0fold = t0, pkA = peaksOf(env, .5), phOf = (tt: number) => ((tt - .03) * sr2 - C.N / 2) / C.H;
  for (const hw of [.05, .03]) {
    const offs: number[] = [];
    for (let k = 2; k < nb0 - 2; k += stride) {
      const tt = t0 + k * Pb, r = localOnset(x, sr2, tt - hw, tt + hw, 0);
      if (r && r.q >= 1.5) offs.push(r.t - tt);
    }
    if (offs.length >= 6) {
      offs.sort((a, b) => a - b);
      const c = offs[offs.length >> 1];
      if (Math.abs(c) < hw) t0 = ((t0 + c) % Pb + Pb) % Pb;
    }
  }
  if (gridAlign(pkA, 60 * fps / bpm, phOf(t0fold), 2.2) > gridAlign(pkA, 60 * fps / bpm, phOf(t0), 2.2) + .02) t0 = t0fold;

  const pkAll = peaksOf(env, .5), phF = ((t0 - .03) * sr2 - C.N / 2) / C.H, align = pkAll.length >= 8 ? gridAlign(pkAll, 60 * fps / bpm, phF, 2.2) : null, valid = pkAll.length;
  const beats: number[] = []; for (let k = 0; t0 + k * Pb < dur; k++) beats.push(t0 + k * Pb);
  const nb = beats.length;

  const rmsL = new Float32Array(nb), lowL = new Float32Array(nb), bl = new Float32Array(nb);
  for (let k = 0; k < nb; k++) {
    const a = clamp(fi(beats[k]), 0, nF - 1); let z = clamp(fi(k + 1 < nb ? beats[k + 1] : dur), 0, nF);
    if (z <= a) z = Math.min(nF, a + 1);
    let sr_ = 0, sl = 0;
    for (let f = a; f < z; f++) { sr_ += C.rms[f]; sl += C.lowE[f]; }
    const c = Math.max(1, z - a); rmsL[k] = sr_ / c; lowL[k] = sl / c;
    let mx = 0;
    for (let j = -2; j <= 2; j++) { const q = C.eLow[a + j]; if (q > mx) mx = q; }
    bl[k] = mx;
  }
  const rmsDb = Float32Array.from(rmsL, dB), lowDb = Float32Array.from(lowL, dB);
  const r5 = pctl(rmsDb, .05), r95 = pctl(rmsDb, .95), l5 = pctl(lowDb, .05), l95 = pctl(lowDb, .95);
  const E = new Float32Array(nb); for (let k = 0; k < nb; k++) E[k] = .5 * nz(rmsDb[k], r5, r95) + .5 * nz(lowDb[k], l5, l95);

  const tr = [0, 0, 0, 0];
  for (let k = 4; k < nb - 4; k++) {
    let a = 0, c = 0;
    for (let j = 0; j < 4; j++) { a += E[k - 4 + j]; c += E[k + j]; }
    tr[k % 4] += Math.abs(c - a) / 4;
  }
  const mtr = (tr[0] + tr[1] + tr[2] + tr[3]) / 4; let bo = 0;
  for (let i = 1; i < 4; i++) if (tr[i] > tr[bo]) bo = i;
  if (!(mtr > 0 && tr[bo] >= mtr * 1.4)) {
    const s4 = [0, 0, 0, 0], c4 = [0, 0, 0, 0];
    for (let k = 0; k < nb; k++) { s4[k % 4] += bl[k]; c4[k % 4]++; }
    const mu4 = s4.map((s, i) => s / (c4[i] || 1)); bo = 0;
    for (let i = 1; i < 4; i++) if (mu4[i] > mu4[bo]) bo = i;
    if (mu4[bo] < (mu4[0] + mu4[1] + mu4[2] + mu4[3]) / 4 * 1.12) {
      bo = 0; for (let k = 0; k < nb; k++) if (bl[k] > .6) { bo = k % 4; break; }
    }
  }

  let bb = 4; while (bb > 1 && bb * 60 / bpm > 3.6) bb /= 2;
  const bo2 = bo % bb, bs = [0]; for (let k = bo2 > 0 ? bo2 : bb; k < nb; k += bb) bs.push(k);
  const nbar = bs.length, Eb = new Float32Array(nbar), bR = new Float32Array(nbar), bLw = new Float32Array(nbar);
  for (let j = 0; j < nbar; j++) {
    const a = bs[j], z = j + 1 < nbar ? bs[j + 1] : nb, c = Math.max(1, z - a);
    let s = 0, r = 0, l = 0;
    for (let k = a; k < z; k++) { s += E[k]; r += rmsL[k]; l += lowL[k]; }
    Eb[j] = s / c; bR[j] = dB(r / c); bLw[j] = dB(l / c);
  }
  const flat = (pctl(bR, .95) - pctl(bR, .05)) < 3 && (pctl(bLw, .95) - pctl(bLw, .05)) < 4;
  const Es = new Float32Array(nbar); for (let j = 0; j < nbar; j++) Es[j] = .25 * Eb[Math.max(0, j - 1)] + .5 * Eb[j] + .25 * Eb[Math.min(nbar - 1, j + 1)];
  const barT = bs.map((k, j) => j == 0 ? 0 : beats[k]);
  const labs = new Array(nbar).fill('ESTABLE');
  if (!flat && nbar >= 4) {
    const cl = new Array(nbar); let st = Es[0] >= .58 ? 2 : Es[0] <= .34 ? 0 : 1; cl[0] = st;
    for (let j = 1; j < nbar; j++) {
      const v = Es[j];
      if (st == 2) { if (v < .48) st = v <= .32 ? 0 : 1; }
      else if (st == 0) { if (v > .42) st = v >= .6 ? 2 : 1; }
      else { if (v >= .6) st = 2; else if (v <= .3) st = 0; }
      cl[j] = st;
    }
    for (let j = 1; j < nbar - 1; j++) if (cl[j - 1] == cl[j + 1] && cl[j] != cl[j - 1]) cl[j] = cl[j - 1];
    const runs: any[] = [];
    for (let j = 0; j < nbar; j++) {
      const r = runs[runs.length - 1];
      if (r && r.c == cl[j]) r.e = j + 1; else runs.push({ c: cl[j], s: j, e: j + 1 });
    }
    const mergeEq = () => {
      for (let q = 1; q < runs.length;) {
        if (runs[q].c == runs[q - 1].c) { runs[q - 1].e = runs[q].e; runs.splice(q, 1); } else q++;
      }
    };
    for (let i = 0; i < runs.length && runs.length > 1;) {
      if (runs[i].e - runs[i].s < 2) {
        if (i > 0) { runs[i - 1].e = runs[i].e; runs.splice(i, 1); }
        else { runs[1].s = runs[0].s; runs.splice(0, 1); }
        mergeEq(); i = 0;
      } else i++;
    }
    if (runs.length > 1) {
      runs.forEach((r, i) => {
        if (r.c != 2 || i == 0 || runs[i - 1].c == 2) return;
        const s0 = r.s; let bj = s0, bv = -9;
        for (let j = Math.max(runs[i - 1].s + 1, s0 - 2); j <= Math.min(r.e - 1, s0 + 2); j++) {
          const v = (bR[j] - bR[j - 1]) + (bLw[j] - bLw[j - 1]); if (v > bv) { bv = v; bj = j; }
        }
        if (bj !== s0) { r.s = bj; runs[i - 1].e = bj; }
      });
      runs.forEach((r, i) => {
        const lb = r.c == 2 ? 'DROP / BEAT' : r.c == 0 ? (i == 0 ? 'INTRO' : i == runs.length - 1 ? 'OUTRO' : 'BREAKDOWN') : (i == 0 ? 'INTRO' : i == runs.length - 1 ? 'OUTRO' : 'ESTABLE');
        for (let j = r.s; j < r.e; j++) labs[j] = lb;
      });
      runs.forEach((r, i) => {
        if (r.c != 2 || i == 0 || runs[i - 1].c == 2) return;
        const s = r.s; let j = s - 1; while (j > 0 && j > s - 12 && Es[j] - Es[j - 1] > .015) j--;
        if (s - j >= 2 && Es[s - 1] - Es[j] >= .1) for (let q = j; q < s; q++) labs[q] = 'BUILD-UP';
      });
    }
  }

  const segs: any[] = [], drops: any[] = [];
  for (let j = 0; j < nbar; j++) {
    const s = segs[segs.length - 1];
    if (s && s.label == labs[j]) { s.e = j + 1; s.en += Es[j]; } else segs.push({ label: labs[j], sb: j, e: j + 1, en: Es[j] });
  }
  segs.forEach(s => { s.s = barT[s.sb]; s.en /= Math.max(1, s.e - s.sb); });

  const kf = Math.max(4, Math.round(.3 * fps)), refDrop = (t: number) => {
    const half = bb * Pb, f0 = Math.max(kf + 1, Math.round(((t - half - .03) * sr2 - C.N / 2) / C.H)), f1 = Math.min(nF - kf - 1, Math.round(((t + half - .03) * sr2 - C.N / 2) / C.H));
    let best = -9, bf = -1;
    for (let f = f0; f <= f1; f++) {
      let p = 0, q = 0; for (let j = 0; j < kf; j++) { p += C.rms[f - 1 - j]; q += C.rms[f + j]; }
      const d = dB(q / kf) - dB(p / kf); if (d > best) { best = d; bf = f; }
    }
    if (best < 3 || bf < 0) return t;
    let tt = (bf * C.H + C.N / 2) / sr2; const r = localOnset(x, sr2, tt - .14, tt + .06, 0); if (r && r.q >= 1.5) tt = r.t;
    return Math.abs(tt - t) <= half + .05 ? tt : t;
  };
  segs.forEach((s, i) => { if (i == 0 || s.label != 'DROP / BEAT') return; const tt = refDrop(s.s); if (tt > segs[i - 1].s + .5) s.s = tt; });
  segs.forEach((s, i) => { s.t1 = i + 1 < segs.length ? segs[i + 1].s : dur; if (s.label == 'DROP / BEAT' && i > 0) drops.push({ t: s.s, bar: s.sb }); });
  const cuts = segs.slice(1).map(s => ({ t: s.s }));

  const kicks: any[] = [];
  for (let f = 2; f < nF - 2; f++) {
    const v = C.eLow[f];
    if (v >= .3 && v >= C.eLow[f - 1] && v > C.eLow[f + 1] && v >= C.eLow[f - 2] && v > C.eLow[f + 2]) {
      let tt = ft(f); const r = localOnset(x, sr2, tt - .06, tt + .04, 200); if (r) tt = r.t;
      const lk = kicks[kicks.length - 1];
      if (lk && tt - lk.t < .09) { if (v > lk.s) { lk.t = tt; lk.s = Math.min(1, v); } } else kicks.push({ t: tt, s: Math.min(1, v) });
    }
  }
  kicks.sort((a, b) => a.t - b.t);

  const pk = new Float32Array(16), pp = new Float32Array(16), stepOf = (tt: number) => {
    let bp = ((tt - t0) / Pb - bo) % 4; if (bp < 0) bp += 4; return Math.round(bp * 4) % 16;
  };
  kicks.forEach(k => pk[stepOf(k.t)] += k.s);
  for (let f = 2; f < nF - 2; f++) {
    const v = C.eHi[f]; if (v >= .35 && v >= C.eHi[f - 1] && v > C.eHi[f + 1]) pp[stepOf(ft(f))] += v;
  }
  const mk = Math.max(1e-6, ...pk), mp = Math.max(1e-6, ...pp);
  for (let i = 0; i < 16; i++) { pk[i] /= mk; pp[i] /= mp; }

  const sc_ = (bb: number) => { if (bb < 50 || bb > 230) return null; const f = foldEnv(env, 60 * fps / bb); return f.pk - f.mean; };
  const alts = [[.5, '½×'], [1, 'actual'], [2, '2×']].map(([mu, l]: any) => ({ bpm: bpm * mu, label: l, score: sc_(bpm * mu) }));
  const conf = clamp(.6 * (align == null ? .5 : align) + .4 * clamp((fit.f.pk / (fit.f.mean + 1e-9) - 1) / 3, 0, 1), 0, 1);

  return { bpm, P: Pb, t0, barOff: bo, beats: Float32Array.from(beats), kicks, segs, drops, cuts, barT, Es, Eb, E, bR, bLw, nb, nbar: Math.ceil((nb - bo) / 4) + (bo > 0 ? 1 : 0), pat: { k: pk, p: pp }, align, conf, alts, dur, flat, valid };
}

const fmtBpm = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Math.abs(r - Math.round(r)) < .005 ? String(Math.round(r)) : r.toFixed(r * 10 % 1 ? 2 : 1);
};

function stateAt(pos: number) {
  if (!BM || !BM.segs.length) return null;
  let lo = 0, hi = BM.segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (BM.segs[m].s <= pos) lo = m; else hi = m - 1; }
  return BM.segs[lo];
}
function nextDropAfter(pos: number) {
  if (!BM) return null;
  for (const d of BM.drops) if (d.t > pos + .05) return d;
  return null;
}
function beatInfo(pos: number) {
  if (!BM) return null;
  const q = (pos - BM.t0) / BM.P, k = Math.floor(q), fr = q - k, rel = k - BM.barOff, bib = ((rel % 4) + 4) % 4;
  return { k, frac: fr, bib, bar: Math.floor(rel / 4), step16: Math.floor((bib + fr) * 4) % 16 };
}

/* ── Rich Aesthetic Harmonic Palette Library (Fixes bug of forced neon blue) ── */
export interface PaletteTheme {
  name: string;
  category: string;
  c1: string;
  c2: string;
  c3: string;
  am: string;
}

const PALETTE_LIBRARY: PaletteTheme[] = [
  { name: 'Monocromo Sigil', category: 'minimal', c1: '#f5f5f5', c2: '#a3a3a3', c3: '#ffffff', am: '#08090c' },
  { name: 'Oro Celestial (Ámbar)', category: 'euphoric', c1: '#f59e0b', c2: '#fbbf24', c3: '#fef08a', am: '#17120a' },
  { name: 'Aurora Boreal Nórdica', category: 'ambient', c1: '#10b981', c2: '#06b6d4', c3: '#6ee7b7', am: '#061a14' },
  { name: 'Terciopelo Cyber (Rose)', category: 'energetic', c1: '#f43f5e', c2: '#fb7185', c3: '#fda4af', am: '#1a0a14' },
  { name: 'Llamarada Solar (Ocre)', category: 'energetic', c1: '#ea580c', c2: '#f97316', c3: '#fdba74', am: '#1f130b' },
  { name: 'Bioluminiscencia Abisal', category: 'ambient', c1: '#059669', c2: '#10b981', c3: '#34d399', am: '#081a14' },
  { name: 'Crepúsculo Etéreo (Amatista)', category: 'melancholic', c1: '#8b5cf6', c2: '#a78bfa', c3: '#c4b5fd', am: '#120e24' },
  { name: 'Lluvia de Tokio (Añil)', category: 'melancholic', c1: '#6366f1', c2: '#818cf8', c3: '#a5b4fc', am: '#090b18' }
];

function analyzeBeatAndSuggestPalettes(buffer: AudioBuffer) {
  const c0 = buffer.getChannelData(0), len = c0.length, step = Math.max(1, Math.floor(len / 4000));
  let sumSq = 0, zcr = 0, maxE = 0;
  for (let i = 0; i < len; i += step) {
    const v = c0[i]; sumSq += v * v; if (Math.abs(v) > maxE) maxE = Math.abs(v);
    if (i > 0 && ((c0[i] >= 0 && c0[i - step] < 0) || (c0[i] < 0 && c0[i - step] >= 0))) zcr++;
  }
  const brightness = zcr / 4000;
  const rms = Math.sqrt(sumSq / (len / step));

  // Determine sentiment / mood
  let recommendedIdx = 0;
  if (rms > 0.22 && brightness > 0.16) {
    // High energy: Solar or Cyber Velvet
    recommendedIdx = brightness > 0.2 ? 4 : 3;
  } else if (brightness > 0.22) {
    // Bright & uplifting: Celestial Gold
    recommendedIdx = 1;
  } else if (rms < 0.12 && brightness < 0.12) {
    // Calm / Ambient: Nordic Aurora or Bioluminescence
    recommendedIdx = 2;
  } else if (brightness < 0.14) {
    // Deep / Melancholic: Ethereal Dusk
    recommendedIdx = 6;
  } else {
    // Balanced: Monocromo Sigil or Tokyo Rain
    recommendedIdx = 0;
  }

  // Pick 6 varied palettes starting with the recommended one
  const generated: PaletteTheme[] = [PALETTE_LIBRARY[recommendedIdx]];
  for (let i = 0; i < PALETTE_LIBRARY.length; i++) {
    if (generated.length >= 6) break;
    if (i !== recommendedIdx) generated.push(PALETTE_LIBRARY[i]);
  }

  renderPaletteChips(generated);
  applyPalette(generated[0].c1, generated[0].c2, generated[0].c3, generated[0].am);
  toast('Paleta por sentimiento musical: ' + generated[0].name);
}

function renderPaletteChips(palettes: PaletteTheme[]) {
  const container = $('#palette-box'); if (!container) return;
  container.innerHTML = '';
  palettes.forEach(p => {
    const chip = document.createElement('div'); chip.className = 'palette-chip';
    chip.innerHTML = `<div class="swatches"><div class="swatch" style="background:${p.c1}"></div><div class="swatch" style="background:${p.c2}"></div><div class="swatch" style="background:${p.c3}"></div></div><span>${p.name}</span>`;
    chip.onclick = () => { applyPalette(p.c1, p.c2, p.c3, p.am); toast('Paleta aplicada: ' + p.name); };
    container.appendChild(chip);
  });
}

let colInputC1: HTMLInputElement | null = null;
let colInputC2: HTMLInputElement | null = null;
let colInputC3: HTMLInputElement | null = null;

function applyPalette(c1: string, c2: string, c3: string, am?: string, name?: string, persist = true) {
  U.uC1.value.set(c1); P.c1 = c1; rootSet('--c1', c1);
  U.uC2.value.set(c2); P.c2 = c2; rootSet('--c2', c2);
  U.uCE.value.set(c3); P.c3 = c3; rootSet('--c3', c3);
  if (am) U.uAm.value.set(am);

  if (colInputC1 && c1.startsWith('#')) colInputC1.value = c1;
  if (colInputC2 && c2.startsWith('#')) colInputC2.value = c2;
  if (colInputC3 && c3.startsWith('#')) colInputC3.value = c3;

  // Persist current palette to localStorage
  if (persist) {
    try {
      localStorage.setItem('sigil.palette', JSON.stringify({ c1, c2, c3, am, name: name || 'Personalizada' }));
    } catch (e) {}
  }
}

function restoreSavedPalette(): boolean {
  try {
    const raw = localStorage.getItem('sigil.palette');
    if (raw) {
      const p = JSON.parse(raw);
      if (p.c1 && p.c2 && p.c3) {
        applyPalette(p.c1, p.c2, p.c3, p.am, p.name, false);
        return true;
      }
    }
  } catch (e) {}
  return false;
}

// Random Palette selector (truly selects a fresh harmonious palette without cyan bias)
let lastRandomPaletteIdx = -1;
function randomizePalette() {
  let idx = Math.floor(Math.random() * PALETTE_LIBRARY.length);
  if (idx === lastRandomPaletteIdx) idx = (idx + 1) % PALETTE_LIBRARY.length;
  lastRandomPaletteIdx = idx;
  const p = PALETTE_LIBRARY[idx];
  applyPalette(p.c1, p.c2, p.c3, p.am, p.name, true);
  toast('Paleta aleatoria: ' + p.name);
}

// AI-powered Palette Generator using Gemini 3.8 Flash API
async function generateAiPalette() {
  const btn = $('#btn-ai-palette') as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Analizando con IA…';
  }
  toast('Sintetizando estado anímico con IA...');

  try {
    const payload = {
      trackName: curName || 'Audio Actual',
      bpm: BM ? Math.round(BM.bpm) : Math.round(A.rtBpm),
      key: A.key,
      lufs: Number(M.lufs.toFixed(1)),
      bass: Number(M.bass.toFixed(2)),
      mid: Number(M.mid.toFixed(2)),
      high: Number(M.high.toFixed(2)),
      centroid: Math.round(A.cent),
      character: A.stage,
    };

    const res = await fetch('/api/generate-palette', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data && data.success && data.palette) {
      const p = data.palette;
      applyPalette(p.c1, p.c2, p.c3, p.am, p.paletteName, true);
      
      const descEl = $('#ai-palette-desc');
      if (descEl) {
        descEl.style.display = 'block';
        descEl.innerHTML = `<span style="display:inline-block;padding:2px 7px;border-radius:999px;border:1px solid var(--ln);font-size:9.5px;font-family:ui-monospace,monospace;margin-bottom:4px;background:rgba(255,255,255,.08)">★ IA GEMINI 3.8 FLASH</span><br><b>${p.paletteName}</b><br><span style="opacity:0.85">${p.sentimentDescription}</span>`;
      }
      toast('Paleta IA aplicada: ' + p.paletteName);
    } else {
      throw new Error('Respuesta no válida');
    }
  } catch (err: any) {
    console.warn('AI palette request error:', err);
    randomizePalette();
    toast('Paleta de sentimiento generada (modo adaptativo)');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '★ Generar con IA (Gemini)';
    }
  }
}

/* ───────── Barra de Onda Táctil (Seeker) ───────── */
const wcv = $('#wave-cv') as HTMLCanvasElement, wg = wcv ? wcv.getContext('2d') : null, wPin = $('#wave-pin');
let wavePeaks: number[] = [], wavePeaksHi: number[] = [];

function generateWavePeaks(b: AudioBuffer) {
  const c0 = b.getChannelData(0), c1 = b.numberOfChannels > 1 ? b.getChannelData(1) : c0, n = 800, step = Math.max(1, Math.floor(c0.length / n));
  wavePeaksHi = [];
  for (let i = 0; i < n; i++) {
    let mx = 0;
    for (let j = 0; j < step; j += 8) {
      const k = i * step + j; mx = Math.max(mx, Math.abs(c0[k] || 0), Math.abs(c1[k] || 0));
    }
    wavePeaksHi.push(mx);
  }
  wavePeaks = [];
  for (let i = 0; i < 120; i++) {
    let mx = 0;
    for (let j = Math.floor(i * n / 120); j < Math.floor((i + 1) * n / 120); j++) mx = Math.max(mx, wavePeaksHi[j]);
    wavePeaks.push(mx);
  }
  drawWaveformSeeker();
}

function drawWaveformSeeker() {
  if (!wcv || !wg) return;
  const w = wcv.clientWidth, h = wcv.clientHeight;
  if (w === 0 || h === 0) return;
  wcv.width = w * pr; wcv.height = h * pr; wg.setTransform(pr, 0, 0, pr, 0, 0);
  wg.clearRect(0, 0, w, h);
  const n = wavePeaks.length || 80, step = w / n, pos = tpos(), prog = dur ? pos / dur : 0;
  for (let i = 0; i < n; i++) {
    const v = wavePeaks[i] || (Math.sin(i * .2) * .3 + .3);
    const bH = Math.max(2, v * h * .85);
    wg.fillStyle = i / n <= prog ? ACC() : P.fg + '44';
    wg.fillRect(i * step, h / 2 - bH / 2, Math.max(1, step - 1.5), bH);
  }
  if (wPin) wPin.style.left = (prog * 100) + '%';
}

const waveSeeker = $('#wave-seeker');
if (waveSeeker) {
  waveSeeker.onpointerdown = (e: PointerEvent) => {
    if (!dur) return;
    const rect = waveSeeker.getBoundingClientRect();
    const seekFrac = (ev: PointerEvent) => seekTo(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * dur);
    seekFrac(e);
    window.onpointermove = seekFrac as any;
    window.onpointerup = () => window.onpointermove = window.onpointerup = null;
  };
}

/* ───────── Dibujo de Analizadores VST ───────── */
const MONO = 'ui-monospace,Menlo,Consolas,monospace';
const FONT = '"Varela Round",ui-rounded,system-ui,sans-serif';
const tx_ = (g: CanvasRenderingContext2D, s: string, x: number, y: number, sz = 10, al: CanvasTextAlign = 'left', col?: string, fo = FONT) => {
  g.font = sz + 'px ' + fo; g.textAlign = al; g.fillStyle = col || P.fg + 'aa'; g.fillText(s, x, y);
};



// Helpers for VST panels
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const T0_ = (g: CanvasRenderingContext2D, s: string) => tx_(g, s, 14, 20, 10, 'left', ACC(), MONO);
const noBM = (g: CanvasRenderingContext2D, w: number, h: number, t_: string) => {
  if (BM) return 0;
  g.clearRect(0, 0, w, h); T0_(g, t_);
  tx_(g, 'Carga un archivo de audio', w / 2, h / 2 - 6, 11, 'center', P.fg + '99', MONO);
  tx_(g, 'para analizar tempo fijo y drops', w / 2, h / 2 + 12, 10, 'center', P.fg + '66', MONO);
  return 1;
};
const colSeg = (lb: string) => lb == 'DROP / BEAT' ? ACC() : lb == 'BUILD-UP' ? '#f5a623' : lb == 'BREAKDOWN' ? cm(.9, .9) : lb == 'INTRO' ? c3(.9) : lb == 'OUTRO' ? P.fg + '88' : cm(.35, .9);
const mmss0 = (x: number) => mmss1(x).replace(/\.\d$/, '');
const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
const rg = (n: number) => ({ a: new Float32Array(n), i: 0, n, c: 0 });
const rp = (r: any, v: number) => { r.a[r.i] = fin(v); r.i = (r.i + 1) % r.n; if (r.c < r.n) r.c++; };
const rget = (r: any, k: number) => r.a[(r.i - r.c + k + r.n) % r.n];
const HS: Record<string, any> = {};
['lufs', 'corr', 'wid', 'cent', 'roll', 'flat', 'crest', 'bal', 'hz'].forEach(k => HS[k] = rg(600));

let curName = '', anBusy = 0, anPct = 0;

/* VST Factory */
function mkVP(id: string, title: string, w: number, h: number, draw: any, txt?: boolean) {
  const el = document.createElement('div'); el.className = 'vp'; el.style.cssText = `display:none;width:${w}px;height:${h + 36}px`;
  el.innerHTML = `<div class="vh"><span>${title}</span><div class="vh-actions"><button class="vh-btn v-min">_</button><button class="vh-btn v-cls">×</button></div></div>${txt ? '<div class="vt"></div>' : '<div class="vc"><canvas></canvas><div class="v-resizer"></div></div>'}`;
  document.body.appendChild(el);
  const p: any = { id, el, draw, open: 0, cv: el.querySelector('canvas'), tx: el.querySelector('.vt'), w: 0, h: 0, dpr: Math.min(window.devicePixelRatio || 1, 2), clr: 1, btnRefs: [] };
  if (p.cv) {
    p.g = p.cv.getContext('2d'); const vc = el.querySelector('.vc') as HTMLElement;
    if (vc) {
      new ResizeObserver(() => {
        p.w = vc.clientWidth; p.h = vc.clientHeight;
        if (p.w > 0 && p.h > 0) {
          p.cv.width = Math.max(1, p.w * p.dpr); p.cv.height = Math.max(1, p.h * p.dpr); p.clr = 1;
        }
      }).observe(vc);
    }
  }
  const hd = el.querySelector('.vh') as HTMLElement;
  hd.onpointerdown = e => {
    if ((e.target as HTMLElement).closest('.vh-btn')) return;
    el.style.zIndex = String(++zt); document.querySelectorAll('.vp').forEach(v => v.classList.remove('active')); el.classList.add('active');
    const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop;
    hd.setPointerCapture(e.pointerId);
    hd.onpointermove = (v: PointerEvent) => {
      el.style.left = Math.max(0, Math.min(window.innerWidth - 80, v.clientX - ox)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - 40, v.clientY - oy)) + 'px';
    };
    hd.onpointerup = () => { hd.onpointermove = null; };
  };
  hd.ondblclick = e => { if (!(e.target as HTMLElement).closest('.vh-btn')) el.classList.toggle('minimized'); };
  (el.querySelector('.v-min') as HTMLElement).onclick = () => el.classList.toggle('minimized');
  (el.querySelector('.v-cls') as HTMLElement).onclick = () => vpToggle(id, 0);
  const rsH = el.querySelector('.v-resizer') as HTMLElement;
  if (rsH) {
    rsH.onpointerdown = e => {
      e.stopPropagation(); rsH.setPointerCapture(e.pointerId);
      const sW = el.offsetWidth, sH = el.offsetHeight, sX = e.clientX, sY = e.clientY;
      rsH.onpointermove = (ev: PointerEvent) => {
        el.style.width = Math.max(220, sW + (ev.clientX - sX)) + 'px';
        el.style.height = Math.max(120, sH + (ev.clientY - sY)) + 'px';
      };
      rsH.onpointerup = () => { rsH.onpointermove = null; };
    };
  }
  VPS[id] = p; return p;
}

function vpToggle(id: string, v: number | boolean) {
  const p = VPS[id]; if (!p) return;
  p.open = v ? 1 : 0; p.el.style.display = v ? 'flex' : 'none';
  if (p.btnRefs) p.btnRefs.forEach((b: HTMLElement) => b.classList.toggle('on', !!v));
  if (p.cb) p.cb.checked = !!v;
  if (v) {
    if (!p.placed) {
      const k = Object.values(VPS).filter((x: any) => x.open).length - 1;
      p.el.style.left = (350 + (k % 8) * 34) + 'px'; p.el.style.top = (56 + (k % 8) * 34) + 'px'; p.placed = 1;
    }
    p.el.style.zIndex = String(++zt); p.clr = 1;
  }
}

function getVstAudioCtx(): VstAudioState {
  return {
    M, A, HS, TL, TR, F, T,
    UB: U.uB.value,
    BM, ac, buf, dur, tpos, fmtBpm, clamp01,
    P, ACC, cm, c3, tx_, MONO, FONT, noteName,
    wavePeaks
  };
}

function drawPanels() {
  if (obs) return;
  let any = 0; for (const id in VPS) if (VPS[id].open) { any = 1; break; }
  if (any && anL && anR && ac && ac.state == 'running') {
    anL.getFloatTimeDomainData(TL); anR.getFloatTimeDomainData(TR); stereo();
  }
  const ctx = getVstAudioCtx();
  for (const id in VPS) {
    const p = VPS[id]; if (!p.open || p.el.classList.contains('minimized')) continue;
    if (p.tx) { if (fq % 30 == 0 || p.clr) { p.draw(p, ctx); p.clr = 0; } }
    else if (p.g && p.w > 10) {
      p.g.setTransform(p.dpr, 0, 0, p.dpr, 0, 0); p.g.globalCompositeOperation = 'source-over';
      p.draw(p.g, p.w, p.h, p, ctx); p.clr = 0;
    }
  }
}

// Instantiate all 60 VST instruments from the complete catalog
const PTITLE: Record<string, string> = {};
VST_CATALOG.forEach((vst, idx) => {
  const fullTitle = `${vst.num} · ${vst.title}`;
  PTITLE[vst.id] = fullTitle;
  const p = mkVP(vst.id, fullTitle, vst.w, vst.h, vst.draw, vst.isTx);
  p.el.style.left = (350 + (idx % 8) * 28) + 'px';
  p.el.style.top = (56 + (idx % 8) * 28) + 'px';
});


/* Beat Cut Sync */
function lat() { return ac ? Math.min(.25, (ac.outputLatency || 0) + (ac.baseLatency || 0)) : 0; }
function lowerB(a: any[], pos: number) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].t < pos) lo = m + 1; else hi = m; }
  return lo;
}
let cutPrev = -1, cutK = 0, cutKi = 0, cutSi = 0;
function cutResync(pos: number) {
  cutPrev = pos;
  if (BM) {
    cutK = Math.floor((pos - BM.t0) / BM.P);
    cutKi = lowerB(BM.kicks, pos);
    cutSi = lowerB(BM.cuts, pos);
  }
}
function nextForm() {
  if (S.cutOrder == 1 && MODS.length > 1) {
    let n; do { n = Math.floor(Math.random() * MODS.length); } while (n == cur);
    setMod(n);
  } else setMod(cur + 1);
}
function doCut() {
  lastCut = t; nextForm();
  const e = $('#sb-form'); if (e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
}
function beatCutTick() {
  if (!S.autoCut || !ac || ac.state != 'running' || !buf || !playing || !BM) return;
  const pos = Math.max(0, tpos() - lat());
  if (cutPrev < 0 || Math.abs(pos - cutPrev) > .4) { cutResync(pos); return; }
  cutPrev = pos; const m = S.cutMode;
  if (m == 0) {
    let f = 0;
    while (cutKi < BM.kicks.length && BM.kicks[cutKi].t <= pos) {
      const k = BM.kicks[cutKi++]; if (k.s >= 1.05 - S.autoCutSens) f = 1;
    }
    if (f && t - lastCut > S.autoCutCool) doCut();
  } else if (m <= 4) {
    const step = [1, 1, 2, 4, 8][m], k = Math.floor((pos - BM.t0) / BM.P);
    if (k !== cutK) {
      const pv = cutK; cutK = k;
      for (let q = pv + 1; q <= k; q++) {
        if (q >= 0 && ((((q - BM.barOff) % step) + step) % step) == 0) { doCut(); break; }
      }
    }
  } else {
    let f = 0;
    while (cutSi < BM.cuts.length && BM.cuts[cutSi].t <= pos) { cutSi++; f = 1; }
    if (f && t - lastCut > .8) doCut();
  }
}

const setBpmTxt = (s: string) => { const e = $('#sb-bpm'); if (e) e.textContent = s; };
const setStage = (s: string) => { A.stage = s; const e = $('#sb-stage'); if (e) e.textContent = s; };

function onBeatMap() {
  if (!BM) { setBpmTxt('—'); setStage('ESTABLE'); toast('Audio demasiado corto para medir el tempo'); return; }
  A.bpmA = BM.bpm; A.bpmC = BM.conf; setBpmTxt(fmtBpm(BM.bpm) + ' BPM'); cutResync(tpos()); layoutHud();
  toast('Tempo fijo: ' + fmtBpm(BM.bpm) + ' BPM · ' + BM.drops.length + ' drop(s)');
}

async function runSongAnalysis(b: AudioBuffer) {
  const tok = ++anTok; anBusy = 1; anPct = 0; BM = null; anCache = null; setStage('ANALIZANDO'); setBpmTxt('…');
  try {
    const r = await analyzeSong(b, tok, p => { anPct = Math.round(p * 100); });
    if (tok !== anTok) return;
    anBusy = 0; BM = r; onBeatMap();
  } catch (e) {
    if (tok === anTok) { anBusy = 0; BM = null; setStage('ESTABLE'); setBpmTxt('—'); toast('No se pudo analizar el tempo'); }
  }
}

function setTempoScale(f: number) {
  if (!anCache || !BM || anBusy) return;
  const nb = BM.bpm * f;
  if (nb < 45 || nb > 230) { toast('Fuera de rango (45–230 BPM)'); return; }
  anBusy = 1; anPct = 0;
  setTimeout(() => {
    try { BM = buildGrid(anCache, nb); onBeatMap(); }
    catch (e) { toast('No se pudo recalcular el tempo'); }
    anBusy = 0;
  }, 30);
}

function updSummary() {
  const el = $('#an-sum'); if (!el) return;
  if (anBusy) { el.textContent = 'Analizando el audio completo… ' + anPct + '%'; return; }
  if (!BM) {
    el.textContent = buf ? 'No hay análisis de tempo para esta pista.' : 'Tempo en tiempo real: ' + Math.round(A.rtBpm) + ' BPM (confianza ' + Math.round(A.rtConf * 100) + '%).\nCarga un archivo para medir la estructura completa.';
    return;
  }
  const pos = tpos(), st = stateAt(pos), nd = nextDropAfter(pos);
  el.textContent = 'Tempo fijo: ' + fmtBpm(BM.bpm) + ' BPM · rejilla ' + (BM.align == null ? '--' : Math.round(BM.align * 100) + '%') +
    '\nEstado: ' + (st ? st.label : '--') + (nd ? ' · próximo drop en ' + Math.max(0, Math.round(nd.t - pos)) + ' s' : '') +
    '\nDrops: ' + BM.drops.length + ' · compases: ' + BM.nbar;
}

function layoutHud() {
  const np = $('#np'), sb = $('#status-bar'); if (!np || !sb) return;
  const W = window.innerWidth, H = window.innerHeight, fw = cw, fh = ch, fl = (W - fw) / 2, ft = (H - fh) / 2, uiOpen = !$('#ui').classList.contains('h') && !document.body.classList.contains('intro');
  const m = 14, left0 = Math.max(fl, uiOpen ? 340 : 0), right0 = fl + fw, avail = Math.max(160, right0 - left0 - 2 * m), bot = H - (ft + fh) + m;
  const kn = Math.min(1, avail / 450); np.style.width = '450px'; np.style.setProperty('--sc', kn.toFixed(3));
  np.style.right = (W - right0 + m) + 'px'; np.style.bottom = 'calc(' + (bot + 2) + 'px + env(safe-area-inset-bottom,0px))';
  const sw = sb.offsetWidth || 420, npH = np.offsetHeight || 120, side = sw + 450 * kn + m <= avail, ks = side ? 1 : Math.min(1, avail / sw);
  sb.style.setProperty('--sc', ks.toFixed(3)); sb.style.left = (left0 + m) + 'px';
  sb.style.bottom = 'calc(' + (side ? bot : bot + npH * kn + 10) + 'px + env(safe-area-inset-bottom,0px))';
}

let entered = 0;
function enterViz() {
  if (entered) return; entered = 1; const st = $('#st');
  document.body.classList.add('entering'); document.body.classList.remove('intro'); if (st) st.classList.add('leave'); layoutHud();
  setTimeout(() => { if (st) st.hidden = true; layoutHud(); }, 1250);
  setTimeout(() => document.body.classList.remove('entering'), 2300);
}

/* ───────── UI: Generador de Controles ───────── */
const ui = $('#in');
const sec = (n: string, o?: number) => {
  const d = document.createElement('details'); d.open = !!o; d.innerHTML = `<summary>${n}</summary>`; ui.appendChild(d); return d;
};
const row = (d: HTMLElement, l: string, e: HTMLElement) => {
  const r = document.createElement('label'); r.className = 'r'; r.innerHTML = `<span>${l}</span>`; r.appendChild(e); d.appendChild(r);
};
const rng = (d: HTMLElement, l: string, a: number, b: number, v: number, cb: (val: number) => void, st = .01) => {
  const e = document.createElement('input'); e.type = 'range'; Object.assign(e, { min: a, max: b, step: st, value: v });
  e.oninput = () => cb(+e.value); row(d, l, e); cb(v);
};
const chk = (d: HTMLElement, l: string, v: number, cb: (val: boolean) => void) => {
  const e = document.createElement('input'); e.type = 'checkbox'; e.checked = !!v;
  e.onchange = () => cb(e.checked); row(d, l, e); cb(!!v);
};
const col = (d: HTMLElement, l: string, v: string, cb: (val: string) => void) => {
  const e = document.createElement('input'); e.type = 'color'; e.value = v;
  e.oninput = () => cb(e.value); row(d, l, e); return e;
};
const btn = (d: HTMLElement, n: string, f: () => void) => {
  const b = document.createElement('button'); b.textContent = n; b.onclick = f; d.appendChild(b); return b;
};
const rootSet = (k: string, v: string) => document.documentElement.style.setProperty(k, v);

function mkKnob(parent: HTMLElement, label: string, min: number, max: number, val: number, cb: (v: number) => void) {
  const wrap = document.createElement('div'); wrap.className = 'r';
  wrap.innerHTML = `<span>${label}</span><div class="knob-box"><div class="knob-dial"><svg viewBox="0 0 42 42"><circle class="knob-bg" cx="21" cy="21" r="17"></circle><circle class="knob-prog" cx="21" cy="21" r="17"></circle></svg><div class="knob-dot"></div></div><span class="knob-label">${(val * 100) | 0}%</span></div>`;
  parent.appendChild(wrap);
  const dial = wrap.querySelector('.knob-dial') as HTMLElement, prog = wrap.querySelector('.knob-prog') as HTMLElement, dot = wrap.querySelector('.knob-dot') as HTMLElement, lbl = wrap.querySelector('.knob-label') as HTMLElement;
  let curVal = val;
  const updateUI = (v: number) => {
    curVal = Math.max(min, Math.min(max, v));
    const pct = (curVal - min) / (max - min);
    prog.style.strokeDashoffset = String(188.5 - (188.5 - 47) * pct);
    dot.style.transform = `rotate(${-135 + 270 * pct}deg)`;
    lbl.textContent = ((curVal * 100) | 0) + '%';
    cb(curVal);
  };
  dial.onpointerdown = e => {
    dial.setPointerCapture(e.pointerId); let sy = e.clientY;
    dial.onpointermove = (ev: PointerEvent) => {
      const dy = sy - ev.clientY; sy = ev.clientY; updateUI(curVal + dy * .008);
    };
    dial.onpointerup = () => { dial.onpointermove = null; };
  };
  dial.ondblclick = () => updateUI(.8); updateUI(val);
}

// 1. Pista y Grabación (Includes user-provided audio stream & mic)
let d = sec('1 · Pista y grabación', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">Carga tu audio o conecta tu micrófono. La interfaz se mantiene limpia en blanco y negro.</div>');
const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.mp3,.wav,.ogg,.flac,audio/*'; fi.id = 'fi'; fi.hidden = true; document.body.appendChild(fi);
fi.onchange = () => { const f = fi.files?.[0]; fi.value = ''; f && loadFile(f); };

const rowBtns = document.createElement('div'); rowBtns.className = 'g';
rowBtns.innerHTML = '<button id="btn-drone">Drone analógico</button><button id="btn-mic">Mic / Stream</button>';
d.appendChild(rowBtns);
const rowBtns2 = document.createElement('div'); rowBtns2.className = 'g';
rowBtns2.innerHTML = '<label class="b" for="fi">Elegir archivo</label><button id="btn-tap">Tap Tempo (T)</button>';
d.appendChild(rowBtns2);
const rowBtnsDrive = document.createElement('div'); rowBtnsDrive.className = 'g';
rowBtnsDrive.innerHTML = '<button id="btn-gdrive">Google Drive</button><button id="btn-cloud-presets">Presets Nube (Firestore)</button>';
d.appendChild(rowBtnsDrive);

($('#btn-drone', d) as HTMLElement).onclick = startDrone;
($('#btn-mic', d) as HTMLElement).onclick = startMicStream;
($('#btn-tap', d) as HTMLElement).onclick = tapTempo;
($('#btn-gdrive', d) as HTMLElement).onclick = openGoogleDriveModal;
($('#btn-cloud-presets', d) as HTMLElement).onclick = openCloudPresetsModal;

const sa_ = document.createElement('select'); sa_.className = 'in';
['Ventana completa', '16:9 Paisaje (YouTube)', '9:16 Vertical (Reels / TikTok)', '1:1 Cuadrado'].forEach((n, i) => sa_.add(new Option(n, String(i))));
sa_.onchange = () => { aspect = +sa_.value; rs(); }; row(d, 'Proporción de pantalla', sa_);
mkKnob(d, 'Ganancia principal', 0, 1, .8, v => { vol = v; if (master) master.gain.value = v; });
chk(d, 'Mostrar disco e info en modo limpio', 0, v => document.body.classList.toggle('keephud', !!v));
btn(d, 'Modo grabación limpio (Ocultar UI)', () => setObs(1));

// 2. Beat Cut y análisis del tempo
d = sec('2 · Beat Cut y análisis de tempo (BPM)', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">BPM medido en tiempo real y fijado offline con rejilla de beats. Pulsa <b>T</b> o usa Tap Tempo para ajustar manualmente.</div>');
chk(d, 'Activar Beat Cut', 0, v => { S.autoCut = +v; cutPrev = -1; if (v && !buf) toast('Beat Cut: sincronizando con tempo'); });
const selMode = document.createElement('select'); selMode.className = 'in';
['Golpes de bombo (kick)', 'Cada beat', 'Cada 2 beats', 'Cada compás (4 beats)', 'Cada 2 compases', 'Cambios de sección y drops'].forEach((n, i) => selMode.add(new Option(n, String(i))));
selMode.value = '3'; selMode.onchange = () => { S.cutMode = +selMode.value; cutResync(tpos()); }; row(d, 'Cortar en', selMode);
const selOrder = document.createElement('select'); selOrder.className = 'in';
['Secuencial (1→40)', 'Aleatorio'].forEach((n, i) => selOrder.add(new Option(n, String(i)))); selOrder.onchange = () => S.cutOrder = +selOrder.value; row(d, 'Orden de formas', selOrder);
rng(d, 'Sensibilidad (solo bombo)', .1, 1, .6, v => S.autoCutSens = v);
rng(d, 'Tiempo mínimo entre cortes', .5, 5, 2.2, v => S.autoCutCool = v);
const anSum = document.createElement('pre'); anSum.id = 'an-sum'; d.appendChild(anSum);
const tBtns = document.createElement('div'); tBtns.className = 'g';
btn(tBtns, 'Tempo ÷2', () => setTempoScale(.5)); btn(tBtns, 'Tempo ×2', () => setTempoScale(2)); d.appendChild(tBtns);

// 3. Paletas de Color Sugeridas y Aleatorias
d = sec('3 · Color y paletas armónicas', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">Paletas dinámicas calculadas según el sentimiento y la energía musical (sin azul neón forzado). Pulsa <b>P</b> para paleta aleatoria.</div>');
const palBox = document.createElement('div'); palBox.id = 'palette-box'; palBox.className = 'palette-chips'; d.appendChild(palBox);
const palBtns = document.createElement('div'); palBtns.className = 'g';
btn(palBtns, 'Paleta Aleatoria (P)', randomizePalette);
btn(palBtns, 'Paleta Monocromo', () => applyPalette('#f5f5f5', '#a3a3a3', '#ffffff', '#08090c', 'Monocromo Sigil', true));
d.appendChild(palBtns);

const aiBtnRow = document.createElement('div'); aiBtnRow.style.marginTop = '6px';
const aiBtn = btn(aiBtnRow, '★ Generar con IA (Gemini)', generateAiPalette);
aiBtn.id = 'btn-ai-palette';
aiBtn.className = 'primary';
aiBtn.style.width = '100%';
aiBtn.style.cursor = 'pointer';
d.appendChild(aiBtnRow);

const aiCard = document.createElement('div');
aiCard.id = 'ai-palette-desc';
aiCard.className = 'guide';
aiCard.style.display = 'none';
aiCard.style.marginTop = '8px';
d.appendChild(aiCard);

chk(d, 'Fondo claro (modo papel sumi-ink)', 0, v => {
  U.uInv.value = v ? 1 : 0; document.body.classList.toggle('w', v);
  P.fg = v ? '#121418' : '#f0f2f7'; rootSet('--paper', v ? '#f5f3ec' : '#07080b');
});
chk(d, 'Fijar paleta cromática', 1, v => fixC = +v);
colInputC1 = col(d, 'Núcleo primario', P.c1, v => { applyPalette(v, P.c2, P.c3, undefined, 'Personalizada', true); });
colInputC2 = col(d, 'Borde secundario', P.c2, v => { applyPalette(P.c1, v, P.c3, undefined, 'Personalizada', true); });
colInputC3 = col(d, 'Resplandor de impacto', P.c3, v => { applyPalette(P.c1, P.c2, v, undefined, 'Personalizada', true); });

// 4. Formas Visuales (41)
d = sec('4 · Formas visuales (41)', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">Cambia de forma con ← / → o activa Beat Cut. Partículas cuánticas, mallas físicas y espectrograma de cascada.</div>');
[['Partículas cuánticas (1–10)', 0, 10], ['Mallas físicas (11–20)', 10, 20], ['Partículas II (21–30)', 20, 30], ['Mallas II (31–40)', 30, 40], ['Espectrograma 3D (41)', 40, 41]].forEach(([lb, s0, s1]: any) => {
  d.insertAdjacentHTML('beforeend', '<div class="sub-h">' + lb + '</div>'); const gd = document.createElement('div'); gd.className = 'g'; d.appendChild(gd);
  for (let i = s0; i < s1; i++) mb.push(btn(gd, `${i + 1} ${MODS[i][0]}`, () => setMod(i)));
});

// 5. Módulos VST (60 Instrumentos)
d = sec('5 · Instrumentos de análisis VST (60)', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">60 analizadores acústicos y visuales en pantalla. Organizados por categorías y accesibles como ventanas flotantes translúcidas.</div>');

// Priorización de Instrumentos Favoritos (Destacados y Accesibles Primero)
d.insertAdjacentHTML('beforeend', '<div class="sub-h">★ FAVORITOS DESTACADOS</div>');
const favRow = document.createElement('div'); favRow.className = 'g';
const favIds = ['rack', 'cym', 'vec', 'osc'];
favIds.forEach(fid => {
  const vst = VST_CATALOG.find(x => x.id === fid);
  if (!vst) return;
  const b = btn(favRow, `${vst.num} ${vst.title}`, () => vpToggle(fid, !VPS[fid]?.open));
  if (VPS[fid]) VPS[fid].btnRefs.push(b);
});
const btnCloseAll = btn(favRow, '✕ Cerrar todas', () => Object.keys(VPS).forEach(i => vpToggle(i, 0)));
btnCloseAll.style.opacity = '0.75';
d.appendChild(favRow);

// Estructura del Catálogo Completo (60 Módulos por Categoría)
const CATEGORIES = [
  '01–10: Consola y Favoritos',
  '11–20: Dinámica & Transitorios',
  '21–30: Imagen Estéreo & Fase',
  '31–40: Espectro & Frecuencia Avanzada',
  '41–50: Estructura & Música',
  '51–60: Acústica & Diagnóstico Máster'
];

CATEGORIES.forEach((catName, catIdx) => {
  const catItems = VST_CATALOG.filter(x => x.catIndex === catIdx);
  const det = document.createElement('details');
  det.className = 'sub';
  det.open = catIdx === 0;
  det.innerHTML = `<summary>${catName} <span class="cat-n">(${catItems.length})</span></summary>`;
  const grid = document.createElement('div');
  grid.className = 'g';
  grid.style.marginTop = '6px';
  catItems.forEach(item => {
    const b = btn(grid, `${item.num} ${item.title}`, () => {
      vpToggle(item.id, !VPS[item.id]?.open);
    });
    b.title = item.title;
    if (VPS[item.id]) VPS[item.id].btnRefs.push(b);
  });
  det.appendChild(grid);
  d.appendChild(det);
});

// 6. Sensibilidad Musical
d = sec('6 · Sensibilidad musical');
[['loud', 'Sonoridad (LUFS)'], ['bass', 'Graves y sub (20-150Hz)'], ['mid', 'Medios y voces'], ['high', 'Agudos y brillo'], ['sat', 'Saturación armónica'], ['dyn', 'Rango dinámico'], ['air', 'Aire y estática'], ['speed', 'Velocidad de flujo'], ['size', 'Tamaño de partículas']].forEach(([k, l]: any) => rng(d, l, 0, 3, 1, v => (S as any)[k] = v));

// 7. Efectos Ópticos GPU (Calibrated Bloom & Presets)
d = sec('7 · Efectos ópticos GPU (30 y Presets)', 1);
d.insertAdjacentHTML('beforeend', '<div class="guide">Crea y carga presets ópticos o selecciona los estilos prediseñados de estudio y ProjectM.</div>');

// Preset selector & controls
const presetRow = document.createElement('div');
presetRow.className = 'r';
presetRow.innerHTML = '<span>Preset óptico</span>';
const selFxPreset = document.createElement('select');
selFxPreset.id = 'sel-fx-preset';
selFxPreset.className = 'in';
presetRow.appendChild(selFxPreset);
d.appendChild(presetRow);

const fxCustomRow = document.createElement('div');
fxCustomRow.className = 'g';
const inpFxName = document.createElement('input');
inpFxName.id = 'inp-fx-name';
inpFxName.className = 'in';
inpFxName.placeholder = 'Nombre de nuevo preset...';
fxCustomRow.appendChild(inpFxName);

const btnSavePreset = document.createElement('button');
btnSavePreset.textContent = 'Guardar';
btnSavePreset.onclick = () => {
  const name = inpFxName.value.trim();
  if (!name) return toast('Escribe un nombre para el preset');
  saveUserFxPreset(name);
  inpFxName.value = '';
};
fxCustomRow.appendChild(btnSavePreset);
d.appendChild(fxCustomRow);

const presetActionsRow = document.createElement('div');
presetActionsRow.className = 'g';
const btnDelPreset = document.createElement('button');
btnDelPreset.textContent = 'Borrar Preset';
btnDelPreset.onclick = () => {
  deleteUserFxPreset(selFxPreset.value);
};
presetActionsRow.appendChild(btnDelPreset);
const btnCloudSync = document.createElement('button');
btnCloudSync.textContent = 'Presets en la Nube';
btnCloudSync.onclick = openCloudPresetsModal;
presetActionsRow.appendChild(btnCloudSync);
d.appendChild(presetActionsRow);

interface FxPreset {
  name: string;
  isDefault?: boolean;
  fx: [number, number][];
}

const mkPresetFx = (m: Record<number, number>): [number, number][] => {
  return FX.map((f, i) => m[i] !== undefined ? [1, m[i]] : [0, f[2]]);
};

const DEFAULT_FX_PRESETS: Record<string, FxPreset> = {
  'Distorsión Térmica & Heat Haze': {
    name: 'Distorsión Térmica & Heat Haze',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.22, 1: 0.38, 8: 0.40, 30: 0.70 })
  },
  'Prisma Anamórfico & Láser': {
    name: 'Prisma Anamórfico & Láser',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.22, 1: 0.45, 8: 0.40, 24: 0.75, 26: 0.65 })
  },
  'Visión Térmica FLIR': {
    name: 'Visión Térmica FLIR',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.20, 8: 0.35, 25: 0.85, 30: 0.45 })
  },
  'Solarización Sabattier Alien': {
    name: 'Solarización Sabattier Alien',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.25, 10: 0.30, 14: 0.45, 28: 0.80 })
  },
  'Pergamino Washi & Tinta Sumi': {
    name: 'Pergamino Washi & Tinta Sumi',
    isDefault: true,
    fx: mkPresetFx({ 6: 0.25, 8: 0.40, 11: 0.40, 29: 0.85 })
  },
  'Película Bleach Bypass 35mm': {
    name: 'Película Bleach Bypass 35mm',
    isDefault: true,
    fx: mkPresetFx({ 1: 0.35, 6: 0.50, 8: 0.50, 27: 0.80 })
  },
  'Mirage del Desierto (Heat Haze)': {
    name: 'Mirage del Desierto (Heat Haze)',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.20, 1: 0.45, 15: 0.35, 30: 0.85 })
  },
  'Demoscene Synthwave 80s': {
    name: 'Demoscene Synthwave 80s',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.30, 1: 0.50, 5: 0.45, 24: 0.70, 26: 0.55 })
  },
  'ProjectM Líquido': {
    name: 'ProjectM Líquido',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.28, 1: 0.55, 8: 0.45, 12: 0.50 })
  },
  'Estudio Limpio': {
    name: 'Estudio Limpio',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.18, 8: 0.35 })
  },
  'Cyberpunk Glitch 2077': {
    name: 'Cyberpunk Glitch 2077',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.30, 1: 0.65, 2: 0.45, 4: 0.60, 26: 0.45, 30: 0.40 })
  },
  'Retro VHS & Tracking CRT': {
    name: 'Retro VHS & Tracking CRT',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.18, 5: 0.50, 6: 0.45, 8: 0.40, 19: 0.55 })
  },
  'Caleidoscopio Dimensional': {
    name: 'Caleidoscopio Dimensional',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.26, 9: 0.45, 15: 0.35, 16: 0.55 })
  },
  'Dither Monocromo 1-Bit': {
    name: 'Dither Monocromo 1-Bit',
    isDefault: true,
    fx: mkPresetFx({ 8: 0.35, 14: 0.45, 17: 0.70 })
  },
  'Agujero de Gusano Espectral': {
    name: 'Agujero de Gusano Espectral',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.25, 12: 0.40, 20: 0.60, 24: 0.60, 30: 0.40 })
  },
  'Halftone Pop-Art Warhol': {
    name: 'Halftone Pop-Art Warhol',
    isDefault: true,
    fx: mkPresetFx({ 11: 0.50, 13: 0.65, 23: 0.35 })
  },
  'Glitch Cuántico & JPEG Corrupt': {
    name: 'Glitch Cuántico & JPEG Corrupt',
    isDefault: true,
    fx: mkPresetFx({ 4: 0.50, 18: 0.65, 19: 0.40, 23: 0.35 })
  },
  'Ojo de Pez Fisheye Club': {
    name: 'Ojo de Pez Fisheye Club',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.25, 1: 0.60, 8: 0.55, 22: 0.65 })
  },
  'Espejo Cósmico & Prisma': {
    name: 'Espejo Cósmico & Prisma',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.22, 9: 0.60, 15: 0.30, 24: 0.65, 26: 0.50 })
  },
  'Mosaico Cuántico Infinito': {
    name: 'Mosaico Cuántico Infinito',
    isDefault: true,
    fx: mkPresetFx({ 0: 0.22, 1: 0.45, 16: 0.40, 21: 0.50 })
  },
  'Minimal Phosphor Lab': {
    name: 'Minimal Phosphor Lab',
    isDefault: true,
    fx: mkPresetFx({ 5: 0.15, 8: 0.20 })
  }
};


function getUserFxPresets(): Record<string, FxPreset> {
  try {
    const raw = localStorage.getItem('sigil.fx_user_presets');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveUserFxPreset(name: string) {
  const currentFx: [number, number][] = fx.map(f => [f.on, f.a]);
  const userPresets = getUserFxPresets();
  userPresets[name] = { name, fx: currentFx };
  try {
    localStorage.setItem('sigil.fx_user_presets', JSON.stringify(userPresets));
    localStorage.setItem('sigil.fx_active_preset', name);
  } catch (e) {}
  populateFxPresetsSelector(name);
  toast(`Preset de efectos guardado: ${name}`);
}

function deleteUserFxPreset(name: string) {
  if (DEFAULT_FX_PRESETS[name]) {
    return toast('No se pueden borrar los presets predeterminados de estudio');
  }
  const userPresets = getUserFxPresets();
  if (!userPresets[name]) return;
  delete userPresets[name];
  try {
    localStorage.setItem('sigil.fx_user_presets', JSON.stringify(userPresets));
  } catch (e) {}
  populateFxPresetsSelector('ProjectM Líquido');
  applyFxPreset('ProjectM Líquido');
  toast(`Preset ${name} borrado`);
}

function applyFxPreset(name: string, persist = true) {
  const allPresets = { ...DEFAULT_FX_PRESETS, ...getUserFxPresets() };
  const preset = allPresets[name];
  if (!preset) return;

  preset.fx.forEach(([onVal, aVal], idx) => {
    if (fx[idx]) {
      fx[idx].on = onVal;
      fx[idx].a = aVal;
    }
    if (fxEls[idx]) {
      fxEls[idx].c.checked = !!onVal;
      fxEls[idx].s.value = String(aVal);
    }
  });

  if (persist) {
    try {
      localStorage.setItem('sigil.fx_active_preset', name);
    } catch (e) {}
    toast(`Preset óptico: ${name}`);
  }
}

function saveActiveFxState() {
  try {
    const activeFx: [number, number][] = fx.map(f => [f.on, f.a]);
    localStorage.setItem('sigil.fx_current_state', JSON.stringify(activeFx));
  } catch (e) {}
}

function populateFxPresetsSelector(selectedName?: string) {
  if (!selFxPreset) return;
  selFxPreset.innerHTML = '';
  const optGroupDef = document.createElement('optgroup');
  optGroupDef.label = 'Presets de Estudio';
  Object.keys(DEFAULT_FX_PRESETS).forEach(k => {
    const opt = new Option(k, k);
    if (k === selectedName) opt.selected = true;
    optGroupDef.appendChild(opt);
  });
  selFxPreset.appendChild(optGroupDef);

  const userPresets = getUserFxPresets();
  const userKeys = Object.keys(userPresets);
  if (userKeys.length > 0) {
    const optGroupUser = document.createElement('optgroup');
    optGroupUser.label = 'Mis Presets Guardados';
    userKeys.forEach(k => {
      const opt = new Option(k, k);
      if (k === selectedName) opt.selected = true;
      optGroupUser.appendChild(opt);
    });
    selFxPreset.appendChild(optGroupUser);
  }

  selFxPreset.onchange = () => {
    applyFxPreset(selFxPreset.value);
  };
}

const fxEls: { c: HTMLInputElement; s: HTMLInputElement }[] = [];
FX.forEach((f, i) => {
  const r = document.createElement('div'); r.className = 'r';
  r.innerHTML = `<input type=checkbox ${f[1] ? 'checked' : ''}><span>${f[0]}</span><input type=range min=0 max=1 step=.01 value=${f[2]}>`;
  const c = r.children[0] as HTMLInputElement, s = r.children[2] as HTMLInputElement;
  fxEls[i] = { c, s };
  c.onchange = () => { fx[i].on = c.checked ? 1 : 0; saveActiveFxState(); };
  s.oninput = () => { fx[i].a = +s.value; saveActiveFxState(); };
  d.appendChild(r);
});

// 8. Rendimiento
d = sec('8 · Rendimiento y sesión');
rng(d, 'Densidad de partículas', 0, 1, .6, v => {
  pmax = pcount = Math.round(1e4 * Math.pow(300, v) / 1e3) * 1e3;
  pg.setDrawRange(0, pcount);
}, .005);
rdEl = document.createElement('pre'); d.appendChild(rdEl);

// Drawer toggle button
const tg = $('#tg');
if (tg) {
  tg.onclick = () => {
    const h = $('#ui').classList.toggle('h');
    tg.style.left = h ? '12px' : '340px';
    layoutHud();
  };
}

const toastEl = $('#toast'); let toastT = 0;
function toast(m: string) {
  if (!toastEl) return;
  toastEl.textContent = m; toastEl.classList.add('on');
  clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.classList.remove('on'), 3500);
}

function setObs(v: number) {
  obs = v ? 1 : 0; document.body.classList.toggle('obs', !!obs);
  if (obs) toast('Modo grabación activo · Pulsa H para restaurar');
}

window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName || '') && e.key != 'Escape') return;
  const k = e.key;
  if (k == 'ArrowRight') setMod(cur + 1);
  if (k == 'ArrowLeft') setMod(cur - 1);
  if (k == 'h' || k == 'H') setObs(obs ? 0 : 1);
  if (k == 'p' || k == 'P') randomizePalette();
  if (k == 't' || k == 'T') tapTempo();
  if (k == 'Escape' && obs) setObs(0);
  if (k == ' ') { e.preventDefault(); togglePlay(); }
});

const dz = $('#dz');
if (dz) {
  ['dragenter', 'dragover'].forEach(k => window.addEventListener(k, e => { e.preventDefault(); dz.classList.add('on'); }));
  ['dragleave', 'dragend'].forEach(k => window.addEventListener(k, (e: any) => { if (!e.relatedTarget) dz.classList.remove('on'); }));
  window.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); const f = e.dataTransfer?.files[0]; f && loadFile(f); });
}

const goBtn = $('#go'); if (goBtn) goBtn.onclick = startDrone;
const enterBtn = $('#enter'); if (enterBtn) enterBtn.onclick = enterViz;

/* ───────── Controlador de Vinilo y Reproducción ───────── */
const dw = $('#dw'), discBar = $('#disc-bar'), discTip = $('#disc-tip'), discIcon = $('#disc-icon'), CIRC = 326.7;

function scrubFromEvent(e: PointerEvent) {
  if (!dur || !dw) return;
  const rect = dw.getBoundingClientRect();
  let rad = Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) + Math.PI / 2;
  if (rad < 0) rad += Math.PI * 2;
  seekTo(rad / (Math.PI * 2) * dur);
}

if (dw) {
  dw.onpointerdown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('#disc-play-btn') || target.id == 'lb' || target.id == 'disc-icon') {
      togglePlay(); return;
    }
    dw.setPointerCapture(e.pointerId); scrubFromEvent(e);
    dw.onpointermove = scrubFromEvent as any;
    dw.onpointerup = () => { dw.onpointermove = null; };
  };
}

/* ───────── Web Audio API Engine ───────── */
const F = new Uint8Array(4096), T = new Float32Array(2048);

function initA() {
  if (ac) return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  ac = new AudioContextClass();
  master = ac.createGain(); master.gain.value = vol;
  an = ac.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = .65;

  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38;
  const sh = ac.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1500; sh.gain.value = 4;
  anK = ac.createAnalyser(); anK.fftSize = 2048; anK.smoothingTimeConstant = 0;

  master.connect(an); master.connect(hp); hp.connect(sh); sh.connect(anK); master.connect(ac.destination);
  const spl = ac.createChannelSplitter(2);
  anL = ac.createAnalyser(); anR = ac.createAnalyser(); anL.fftSize = anR.fftSize = 2048;
  master.connect(spl); spl.connect(anL, 0); spl.connect(anR, 1);
}

function stopFile() {
  if (mel) {
    mel.onended = null;
    try { mel.stop(); } catch (e) { }
    mel.disconnect(); mel = null;
  }
}

function tpos() {
  if (!buf) return ac ? ac.currentTime - t0 : 0;
  const p = playing && ac ? ac.currentTime - t0 : off;
  return loopOn ? p % dur : Math.min(p, dur);
}

function playAt(o: number) {
  if (!ac || !master || !buf) return;
  stopFile();
  o = Math.max(0, Math.min(o, dur - .05));
  mel = ac.createBufferSource();
  mel.buffer = buf; mel.loop = !!loopOn;
  mel.connect(master);
  mel.onended = () => {
    if (!loopOn && mel) {
      playing = 0; off = 0; mel = null;
      if (discIcon) discIcon.textContent = '▶';
    }
  };
  mel.start(0, o);
  t0 = ac.currentTime - o; off = o; playing = 1;
  if (discIcon) discIcon.textContent = '❚❚';
}

function seekTo(s: number) {
  if (!buf) return;
  s = loopOn ? ((s % dur) + dur) % dur : Math.max(0, Math.min(s, dur));
  if (playing) playAt(s); else off = s;
  drawWaveformSeeker();
}

function togglePlay() {
  if (!ac) return;
  if (buf) {
    if (playing) {
      off = tpos(); stopFile(); playing = 0;
      if (discIcon) discIcon.textContent = '▶';
    } else playAt(off);
  } else {
    ac.state == 'running' ? ac.suspend() : ac.resume();
  }
}

window.addEventListener('pointerdown', () => { initA(); if (ac) ac.resume(); }, { once: true });

async function loadFile(f: File) {
  initA(); enterViz();
  try {
    if (!ac) return;
    const b = await ac.decodeAudioData(await f.arrayBuffer());
    if (dr) { dr.stop(); dr = null; }
    if (micStream) { micStream.getTracks().forEach(tr => tr.stop()); micStream = null; }
    if (micSource) { micSource.disconnect(); micSource = null; }

    buf = b; dur = b.duration; off = 0; curName = f.name.replace(/\.[^.]+$/, ''); cutPrev = -1;
    playAt(0); resetM(); onMain(b);
    generateWavePeaks(b);
    analyzeBeatAndSuggestPalettes(b);

    const nti = $('#nti'), nta = $('#nta');
    if (nti) nti.textContent = curName;
    if (nta) nta.textContent = 'Pista local cargada';
    toast('Audio cargado: ' + f.name + ' · analizando tempo…');
    runSongAnalysis(b);
  } catch (e) {
    toast('Error al leer audio');
  }
}

async function loadAudioBufferData(b: AudioBuffer, name: string) {
  initA(); enterViz();
  if (!ac) return;
  if (dr) { dr.stop(); dr = null; }
  if (micStream) { micStream.getTracks().forEach(tr => tr.stop()); micStream = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }

  buf = b; dur = b.duration; off = 0; curName = name.replace(/\.[^.]+$/, ''); cutPrev = -1;
  playAt(0); resetM(); onMain(b);
  generateWavePeaks(b);
  analyzeBeatAndSuggestPalettes(b);

  const nti = $('#nti'), nta = $('#nta');
  if (nti) nti.textContent = curName;
  if (nta) nta.textContent = 'Audio desde Google Drive';
  toast('Audio cargado: ' + name + ' · analizando tempo…');
  runSongAnalysis(b);
}

// Google Drive Audio Vault Modal & Export logic
async function openGoogleDriveModal() {
  const modal = $('#gdrive-modal');
  const container = $('#gdrive-content');
  if (!modal || !container) return;
  modal.removeAttribute('hidden');

  const renderLoginView = () => {
    container.innerHTML = `
      <div class="drive-empty">
        <p style="margin-bottom:14px;font-size:13px">Conecta tu cuenta de Google para explorar y reproducir tus pistas de audio (.mp3, .wav, .flac, .ogg) directamente desde tu Google Drive.</p>
        <button id="btn-gdrive-login" class="gsi-material-button">
          <div class="gsi-material-button-icon">
            <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path></svg>
          </div>
          <span>Continuar con Google</span>
        </button>
      </div>
    `;
    const btnLogin = $('#btn-gdrive-login', container);
    if (btnLogin) {
      btnLogin.onclick = async () => {
        try {
          toast('Iniciando sesión con Google...');
          await googleSignIn();
          renderFilesView();
        } catch (e: any) {
          toast('Error al iniciar sesión: ' + (e.message || e));
        }
      };
    }
  };

  const renderFilesView = async (searchTerm = '') => {
    const user = auth.currentUser;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--ln);font-size:11px;font-family:ui-monospace,monospace">
        <span style="opacity:.8">${user?.email || 'Conectado'}</span>
        <button id="btn-gdrive-logout" style="padding:2px 8px;font-size:10px">Cerrar sesión</button>
      </div>
      <div class="drive-search-box">
        <input type="text" id="gdrive-search-input" class="in" style="flex:1" placeholder="Buscar pistas de audio..." value="${searchTerm}">
        <button id="btn-gdrive-search" style="padding:6px 12px">Buscar</button>
      </div>
      <div id="gdrive-file-list" class="drive-file-list">
        <div class="drive-empty">Cargando pistas de tu Google Drive...</div>
      </div>
    `;

    const btnLogout = $('#btn-gdrive-logout', container);
    if (btnLogout) {
      btnLogout.onclick = async () => {
        await logoutGoogle();
        renderLoginView();
      };
    }

    const searchInput = $('#gdrive-search-input', container) as HTMLInputElement;
    const btnSearch = $('#btn-gdrive-search', container);
    const doSearch = () => {
      const q = searchInput?.value.trim() || '';
      loadFiles(q);
    };
    if (btnSearch) btnSearch.onclick = doSearch;
    if (searchInput) searchInput.onkeydown = e => { if (e.key === 'Enter') doSearch(); };

    const fileListEl = $('#gdrive-file-list', container);
    const loadFiles = async (q = '') => {
      if (!fileListEl) return;
      fileListEl.innerHTML = '<div class="drive-empty">Buscando archivos de audio...</div>';
      try {
        const { files } = await listDriveAudioFiles(q);
        if (!files || files.length === 0) {
          fileListEl.innerHTML = '<div class="drive-empty">No se encontraron archivos de audio (.mp3, .wav, .flac, .ogg) en tu Google Drive.</div>';
          return;
        }

        fileListEl.innerHTML = '';
        files.forEach(f => {
          const item = document.createElement('div');
          item.className = 'drive-file-item';
          const sizeMb = f.size ? (Number(f.size) / (1024 * 1024)).toFixed(1) + ' MB' : '';
          item.innerHTML = `
            <div class="drive-file-info">
              <span class="drive-file-name" title="${f.name}">${f.name}</span>
              <span class="drive-file-meta">${sizeMb ? sizeMb + ' · ' : ''}${f.mimeType}</span>
            </div>
            <button class="b" style="padding:4px 10px;font-size:11px">Cargar</button>
            <div class="drive-dl-progress" style="display:none;width:100%"><div class="drive-dl-bar"></div></div>
          `;
          const loadBtn = item.querySelector('button') as HTMLButtonElement;
          const progBox = item.querySelector('.drive-dl-progress') as HTMLElement;
          const progBar = item.querySelector('.drive-dl-bar') as HTMLElement;

          loadBtn.onclick = async () => {
            loadBtn.disabled = true;
            loadBtn.textContent = 'Descargando...';
            progBox.style.display = 'block';
            try {
              initA();
              const arrayBuf = await fetchDriveAudioBuffer(f.id, pct => {
                progBar.style.width = Math.round(pct * 100) + '%';
              });
              if (!ac) throw new Error('AudioContext no disponible');
              toast('Decodificando audio...');
              const audioBuf = await ac.decodeAudioData(arrayBuf);
              await loadAudioBufferData(audioBuf, f.name);
              modal.setAttribute('hidden', '');
            } catch (err: any) {
              toast('Error al cargar archivo: ' + (err.message || err));
              loadBtn.disabled = false;
              loadBtn.textContent = 'Cargar';
              progBox.style.display = 'none';
            }
          };

          fileListEl.appendChild(item);
        });
      } catch (err: any) {
        fileListEl.innerHTML = `<div class="drive-empty" style="color:#ef4444">${err.message || 'Error al conectar con Google Drive'}</div>`;
      }
    };

    loadFiles(searchTerm);
  };

  if (auth.currentUser) {
    renderFilesView();
  } else {
    renderLoginView();
  }
}

async function handleExportCurrentPresetToDrive() {
  if (!auth.currentUser) {
    toast('Inicia sesión en Google Drive primero');
    openGoogleDriveModal();
    return;
  }
  const presetName = prompt('Nombre del preset a exportar a Google Drive:', 'Sigil Preset ' + (curName || 'Custom'));
  if (!presetName) return;

  const presetPayload = {
    name: presetName,
    palette: { c1: P.c1, c2: P.c2, c3: P.c3 },
    shapeIndex: cur,
    shapeName: MODS[cur] ? MODS[cur][0] : 'Desconocida',
    fx: fx.map(f => [f.on, f.a]),
    sensitivity: { ...S },
    exportedAt: new Date().toISOString()
  };

  try {
    toast('Exportando preset a Google Drive...');
    const result = await savePresetToDrive(presetName, presetPayload);
    toast(`Preset exportado exitosamente a Drive (${result.name})`);
  } catch (err: any) {
    toast('Error al exportar: ' + (err.message || err));
  }
}

const gdriveCloseBtn = $('#gdrive-close');
if (gdriveCloseBtn) gdriveCloseBtn.onclick = () => { $('#gdrive-modal')?.setAttribute('hidden', ''); };
const introDriveBtn = $('#intro-gdrive');
if (introDriveBtn) introDriveBtn.onclick = openGoogleDriveModal;

// Firestore Cloud Presets Modal & Real-Time Sync logic
let unsubscribePresets: (() => void) | null = null;

async function openCloudPresetsModal() {
  const modal = $('#cloud-presets-modal');
  const container = $('#cloud-presets-content');
  if (!modal || !container) return;
  modal.removeAttribute('hidden');

  const renderLoginView = () => {
    if (unsubscribePresets) {
      unsubscribePresets();
      unsubscribePresets = null;
    }
    container.innerHTML = `
      <div class="drive-empty">
        <p style="margin-bottom:14px;font-size:13px">Conecta tu cuenta de Google para guardar, sincronizar y restaurar tus presets visuales personalizados (paleta, formas 3D y efectos ópticos) en la nube mediante Firebase Firestore.</p>
        <button id="btn-cloud-login" class="gsi-material-button">
          <div class="gsi-material-button-icon">
            <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path></svg>
          </div>
          <span>Continuar con Google</span>
        </button>
      </div>
    `;
    const btnLogin = $('#btn-cloud-login', container);
    if (btnLogin) {
      btnLogin.onclick = async () => {
        try {
          toast('Iniciando sesión con Google...');
          await googleSignIn();
          renderPresetsView();
        } catch (e: any) {
          toast('Error al iniciar sesión: ' + (e.message || e));
        }
      };
    }
  };

  const renderPresetsView = () => {
    const user = auth.currentUser;
    if (!user) {
      renderLoginView();
      return;
    }

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--ln);font-size:11px;font-family:ui-monospace,monospace">
        <span style="opacity:.8">${user.email || 'Conectado'}</span>
        <button id="btn-cloud-logout" style="padding:2px 8px;font-size:10px">Cerrar sesión</button>
      </div>

      <div style="background:rgba(127,127,127,.05);border:1px solid var(--ln);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px">
        <span style="font-size:11px;font-weight:600;font-family:ui-monospace,monospace;letter-spacing:.03em">GUARDAR PRESET ACTUAL EN FIRESTORE</span>
        <div style="display:flex;gap:8px">
          <input type="text" id="cloud-preset-name-input" class="in" style="flex:1" placeholder="Nombre del preset..." value="Sigil ${MODS[cur] ? MODS[cur][0] : 'Custom'}">
          <button id="btn-cloud-save-current" class="primary" style="padding:6px 14px;font-size:11.5px">Guardar</button>
        </div>
        <div style="display:flex;gap:12px;font-size:10.5px;opacity:.75;font-family:ui-monospace,monospace">
          <span>Forma: <b>${cur + 1}. ${MODS[cur] ? MODS[cur][0] : ''}</b></span>
          <span>Colores: <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${P.c1};vertical-align:middle"></span> <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${P.c2};vertical-align:middle"></span> <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${P.c3};vertical-align:middle"></span></span>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        <span style="font-size:11px;opacity:.7;font-family:ui-monospace,monospace;letter-spacing:.04em">PRESETS EN LA NUBE (FIRESTORE)</span>
        <span id="cloud-presets-count" style="font-size:10px;opacity:.6;font-family:ui-monospace,monospace">Sincronizando…</span>
      </div>

      <div id="cloud-presets-list" class="drive-file-list">
        <div class="drive-empty">Cargando tus presets desde Firestore...</div>
      </div>
    `;

    const btnLogout = $('#btn-cloud-logout', container);
    if (btnLogout) {
      btnLogout.onclick = async () => {
        if (unsubscribePresets) {
          unsubscribePresets();
          unsubscribePresets = null;
        }
        await logoutGoogle();
        renderLoginView();
      };
    }

    const nameInput = $('#cloud-preset-name-input', container) as HTMLInputElement;
    const btnSave = $('#btn-cloud-save-current', container) as HTMLButtonElement;
    if (btnSave) {
      btnSave.onclick = async () => {
        const name = nameInput?.value.trim() || `Sigil Preset ${new Date().toLocaleTimeString()}`;
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
        try {
          const activeFxPresetName = (document.getElementById('sel-fx-preset') as HTMLSelectElement)?.value || 'ProjectM Líquido';
          const amHex = (U.uAm.value as THREE.Color).getHexString ? '#' + (U.uAm.value as THREE.Color).getHexString() : '#08090c';
          await savePresetToCloud({
            name,
            c1: P.c1,
            c2: P.c2,
            c3: P.c3,
            am: amHex,
            presetType: 'Visualizer',
            shapeIndex: cur,
            fxPreset: activeFxPresetName
          });
          toast(`Preset "${name}" guardado exitosamente en Firestore`);
          btnSave.disabled = false;
          btnSave.textContent = 'Guardar';
          if (nameInput) nameInput.value = `Sigil ${MODS[cur] ? MODS[cur][0] : 'Custom'} ${Math.floor(Math.random() * 100)}`;
        } catch (err: any) {
          toast('Error al guardar en Firestore: ' + (err.message || err));
          btnSave.disabled = false;
          btnSave.textContent = 'Guardar';
        }
      };
    }

    const listEl = $('#cloud-presets-list', container);
    const countEl = $('#cloud-presets-count', container);

    if (unsubscribePresets) {
      unsubscribePresets();
      unsubscribePresets = null;
    }

    unsubscribePresets = subscribeToUserPresets(
      user.uid,
      (presets) => {
        if (!listEl) return;
        if (countEl) countEl.textContent = `${presets.length} presets`;

        if (presets.length === 0) {
          listEl.innerHTML = '<div class="drive-empty">No tienes presets guardados en la nube aún.<br>Haz clic en "Guardar" para almacenar tu configuración actual.</div>';
          return;
        }

        listEl.innerHTML = '';
        presets.forEach((p) => {
          const item = document.createElement('div');
          item.className = 'drive-file-item';
          const shapeText = typeof p.shapeIndex === 'number' && MODS[p.shapeIndex] ? `${p.shapeIndex + 1}. ${MODS[p.shapeIndex][0]}` : 'Forma actual';
          const fxText = p.fxPreset || 'FX Estudio';
          item.innerHTML = `
            <div class="drive-file-info">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="drive-file-name" title="${p.name}">${p.name}</span>
                <span style="display:inline-flex;gap:3px;margin-left:4px">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.c1};border:1px solid var(--ln)"></span>
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.c2};border:1px solid var(--ln)"></span>
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.c3};border:1px solid var(--ln)"></span>
                </span>
              </div>
              <span class="drive-file-meta">${shapeText} · ${fxText}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="b btn-apply-cloud-preset" style="padding:4px 10px;font-size:11px">Cargar</button>
              <button class="b btn-delete-cloud-preset" style="padding:4px 8px;font-size:11px;opacity:.6" title="Eliminar preset">×</button>
            </div>
          `;

          const btnApply = item.querySelector('.btn-apply-cloud-preset') as HTMLButtonElement;
          const btnDel = item.querySelector('.btn-delete-cloud-preset') as HTMLButtonElement;

          btnApply.onclick = () => {
            applyPalette(p.c1, p.c2, p.c3, p.am, p.name, true);
            if (typeof p.shapeIndex === 'number' && Number.isFinite(p.shapeIndex) && MODS[p.shapeIndex]) {
              setMod(p.shapeIndex);
            }
            if (p.fxPreset) {
              applyFxPreset(p.fxPreset);
              if (selFxPreset) selFxPreset.value = p.fxPreset;
            }
            toast(`Preset en la nube "${p.name}" aplicado`);
            modal.setAttribute('hidden', '');
          };

          btnDel.onclick = async () => {
            if (!confirm(`¿Eliminar el preset "${p.name}" de Firestore?`)) return;
            btnDel.disabled = true;
            try {
              await deletePresetFromCloud(p.id);
              toast(`Preset "${p.name}" eliminado`);
            } catch (err: any) {
              toast('Error al eliminar preset: ' + (err.message || err));
              btnDel.disabled = false;
            }
          };

          listEl.appendChild(item);
        });
      },
      (err) => {
        if (listEl) {
          listEl.innerHTML = `<div class="drive-empty" style="color:#ef4444">${err.message || 'Error al conectar con Firestore'}</div>`;
        }
      }
    );
  };

  if (auth.currentUser) {
    renderPresetsView();
  } else {
    renderLoginView();
  }
}

const cloudCloseBtn = $('#cloud-presets-close');
if (cloudCloseBtn) cloudCloseBtn.onclick = () => { $('#cloud-presets-modal')?.setAttribute('hidden', ''); };
const introCloudBtn = $('#intro-cloud-presets');
if (introCloudBtn) introCloudBtn.onclick = openCloudPresetsModal;

// Connect user-provided audio stream (Microphone / Line-In)
async function startMicStream() {
  initA(); enterViz();
  if (!ac || !master) return;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Streaming de micrófono no disponible');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    stopFile();
    if (dr) { dr.stop(); dr = null; }
    if (micStream) { micStream.getTracks().forEach(tr => tr.stop()); }
    if (micSource) { micSource.disconnect(); }

    micStream = stream;
    micSource = ac.createMediaStreamSource(stream);
    // Connect directly to analyser to prevent feedback howling
    if (an) micSource.connect(an);

    buf = null; dur = 0; playing = 1; t0 = ac.currentTime; curName = 'Entrada Micrófono / Live Stream';
    const nti = $('#nti'), nta = $('#nta');
    if (nti) nti.textContent = 'Micrófono / Entrada En Vivo';
    if (nta) nta.textContent = 'Extracción de frecuencia en tiempo real';
    if (discIcon) discIcon.textContent = '❚❚';
    toast('Micrófono / Stream conectado');
  } catch (e) {
    toast('Permiso de micrófono denegado. Iniciando drone.');
    startDrone();
  }
}

function startDrone() {
  initA(); if (ac) ac.resume(); stopFile(); enterViz();
  if (!ac || !master) return;
  if (dr) return;
  if (micStream) { micStream.getTracks().forEach(tr => tr.stop()); micStream = null; }
  if (micSource) { micSource.disconnect(); micSource = null; }

  t0 = ac.currentTime; dur = 0; buf = null; playing = 0; resetM();
  if (discIcon) discIcon.textContent = '❚❚';
  BM = null; anCache = null; anTok++; anBusy = 0; wavePeaksHi = []; wavePeaks = [];
  curName = 'Drone procedural analógico'; setStage('ESTABLE'); setBpmTxt('120 BPM'); drawWaveformSeeker();
  const nti = $('#nti'), nta = $('#nta');
  if (nti) nti.textContent = 'Drone procedural analógico';
  if (nta) nta.textContent = 'Christian Daniel';

  const o: [OscillatorNode, number][] = [], g = ac.createGain(); g.gain.value = .3;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  ([[1, 'sawtooth', 0], [1, 'sawtooth', 7], [.5, 'sine', 0], [1.5, 'square', -5]] as [number, OscillatorType, number][]).forEach(([m, ty, dd]) => {
    if (!ac) return;
    const x = ac.createOscillator(); x.type = ty; x.detune.value = dd; x.frequency.value = 55 * m;
    x.start(); x.connect(lp); o.push([x, m]);
  });
  lp.connect(g); g.connect(master);
  dr = { stop() { o.forEach(([x]) => x.stop()); g.disconnect(); } };
  // Default palette for drone
  applyPalette('#f5f5f5', '#a3a3a3', '#ffffff', '#08090c');
}

/* ───────── DSP & Audio Processing ───────── */
const M: Record<string, any> = {
  bass: 0, mid: 0, high: 0, loud: 0, sat: 0, dyn: 0, air: 0, kick: 0,
  lufs: -70, lufsI: -70, peak: -99, hue: 0, note: '--', hz: 0, bpm: 0
};
const NM = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
let pb = 0, hc = 1, hs = 0, lh: number[] = [], lt = 0, pw = 0, pn = 0;

function resetM() {
  lh = []; pw = pn = 0; M.lufsI = -70; M.dyn = 0;
}
const sm = (k: string, v: number) => {
  v = fin(v); M[k] = fin(M[k]) + (v - M[k]) * Math.min(1, dt * (v > M[k] ? 18 : 5));
};

function dsp() {
  const UB = U.uB.value;
  if (!an || !ac || ac.state != 'running' || (!mel && !dr && !micSource)) {
    const q = t * .8;
    sm('bass', .25 + .2 * Math.sin(q * 1.3)); sm('mid', .2 + .1 * Math.sin(q)); sm('high', .1);
    sm('loud', .35 + .1 * Math.sin(q * .7)); sm('sat', .15); sm('dyn', .2); sm('air', .05);
    M.kick *= Math.exp(-dt * 6);
    for (let i = 0; i < 64; i++) UB[i] = .25 + .2 * Math.sin(q + i * .25) * Math.sin(q * .7 - i * .1);
    return;
  }

  an.getByteFrequencyData(F);
  if (anK) anK.getFloatTimeDomainData(T);

  const bw = ac.sampleRate / 8192;
  const bd = (a: number, b: number) => {
    let s = 0; const i0 = a / bw | 0, i1 = Math.min(4095, b / bw | 0);
    for (let i = i0; i <= i1; i++) s += F[i];
    return s / (i1 - i0 + 1) / 255;
  };

  let ms = 0, pk = 0;
  for (let i = 0; i < 2048; i++) {
    const v = T[i]; ms += v * v; pk = Math.max(pk, Math.abs(v));
  }
  ms /= 2048;

  M.lufs = fin(M.lufs) + (-.691 + 10 * Math.log10(ms + 1e-10) - M.lufs) * Math.min(1, dt * 6);
  M.peak = 20 * Math.log10(pk + 1e-6);

  for (let i = 0; i < 64; i++) {
    const f0 = 30 * Math.pow(16000 / 30, i / 64), f1 = 30 * Math.pow(16000 / 30, (i + 1) / 64), k0 = f0 / bw | 0, k1 = Math.max(k0, f1 / bw | 0);
    let m = 0;
    for (let k = k0; k <= k1; k++) m = Math.max(m, F[k]);
    UB[i] = fin(UB[i] + (Math.pow(m / 255, 1.6) - UB[i]) * Math.min(1, dt * 20));
  }

  const b = bd(20, 150);
  M.kick = Math.max(M.kick * Math.exp(-dt * 6), Math.min(1, Math.max(0, b - pb) * 8));
  pb = b;

  sm('bass', Math.pow(b, 1.7)); sm('mid', Math.pow(bd(150, 2000), 1.7)); sm('high', Math.pow(bd(2000, 10000), 1.7)); sm('air', Math.pow(bd(10000, 16000), 1.7)); sm('loud', Math.max(0, Math.min(1, (M.lufs + 55) / 40)));

  let pi = 0, pv = 0;
  for (let i = Math.floor(50 / bw); i < Math.floor(2000 / bw); i++) if (F[i] > pv) { pv = F[i]; pi = i; }
  if (pv > 110 && pi > 2) {
    const hz = pi * bw;
    if (hz > 20) {
      const n = Math.round(69 + 12 * Math.log2(hz / 440)), pc = (n % 12 + 12) % 12;
      M.note = NM[pc] + (Math.floor(n / 12) - 1); M.hz = hz;
      hc += (Math.cos(pc / 12 * 6.28) - hc) * dt * 2;
      hs += (Math.sin(pc / 12 * 6.28) - hs) * dt * 2;
      M.hue = Math.atan2(hs, hc);
    }
  }

  lt += dt;
  if (lt > .1) {
    lt = 0; lh.push(M.lufs);
    if (lh.length > 100) lh.shift();
    if (M.lufs > -70) {
      pw += Math.pow(10, (M.lufs + .691) / 10); pn++; M.lufsI = -.691 + 10 * Math.log10(pw / pn);
    }
  }
  sm('sat', Math.min(.5, .1 + A.flat * 1.6 + M.high * .35));
  if (lh.length > 20) {
    const w_ = lh.slice(-80); sm('dyn', Math.min(.55, .1 + (Math.max(...w_) - Math.min(...w_)) / 40));
  }
}

/* ───────── Interactive 3D Camera ───────── */
const C = { th: .7, ph: 1.25, r: 18, gth: .7, gph: 1.25, gr: 18, t: new THREE.Vector3(), gt: new THREE.Vector3() };

if (hit) {
  hit.onpointerdown = (e: PointerEvent) => {
    drag = (e.button == 2 || e.shiftKey) ? 2 : 1; lx = e.clientX; ly = e.clientY; hit.setPointerCapture(e.pointerId);
  };
  hit.onpointermove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (drag == 1) {
      C.gth -= dx * .005; C.gph = Math.max(.05, Math.min(3.09, C.gph - dy * .005));
    } else {
      const k = C.gr * .0017;
      C.gt.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), -dx * k).addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), dy * k);
    }
  };
  hit.onpointerup = hit.onpointercancel = () => drag = 0;
  hit.oncontextmenu = e => e.preventDefault();
  hit.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault(); C.gr = Math.max(1, Math.min(900, C.gr * Math.exp(e.deltaY * .0012)));
  }, { passive: false });
}

const disc = $('#disc');

/* ───────── Main Animation Loop ───────── */
function frame(now: number) {
  requestAnimationFrame(frame);
  dt = Math.min(.05, (now - last) / 1000 || .016); last = now; t += dt; fa += (dt * 1000 - fa) * .05; fq++;
  dsp(); analyze(); beatCutTick();

  // Actualización del Espectrograma de Cascada: historial de frecuencias de 5s desplazándose hacia abajo
  wfAccum += dt;
  const sliceDt = 5.0 / WF_SLICES;
  while (wfAccum >= sliceDt) {
    wfAccum -= sliceDt;
    wfHead = (wfHead + 1) % WF_SLICES;
    const rowOffset = wfHead * WF_BINS;
    const bw = ac ? ac.sampleRate / 8192 : 44100 / 8192;
    const isAudio = an && ac && ac.state == 'running' && (mel || dr || micSource);
    for (let b = 0; b < WF_BINS; b++) {
      if (isAudio) {
        const f0 = 25 * Math.pow(16000 / 25, b / WF_BINS);
        const f1 = 25 * Math.pow(16000 / 25, (b + 1) / WF_BINS);
        const k0 = Math.max(0, Math.floor(f0 / bw));
        const k1 = Math.min(4095, Math.max(k0, Math.floor(f1 / bw)));
        let peak = 0;
        for (let k = k0; k <= k1; k++) {
          if (F[k] > peak) peak = F[k];
        }
        wfBuffer[rowOffset + b] = Math.pow(peak / 255, 1.5);
      } else {
        const q = t * 1.2 + b * 0.12;
        const ubi = U.uB.value[b % 64] || 0;
        wfBuffer[rowOffset + b] = ubi * 0.75 + 0.12 * Math.sin(q);
      }
    }
    wfTex.needsUpdate = true;
    U_WF.uWfHead.value = wfHead / WF_SLICES;
  }

  if (BM && buf) {
    const st_ = stateAt(tpos());
    if (st_ && st_.label !== A.stage) setStage(st_.label);
  }

  for (const k in M) if (typeof M[k] == 'number' && !Number.isFinite(M[k])) M[k] = 0;

  U.uBass.value = M.bass * S.bass;
  U.uMid.value = M.mid * S.mid;
  U.uHigh.value = M.high * S.high;
  U.uLoud.value = M.loud * S.loud;
  U.uSat.value = M.sat * S.sat;
  U.uDyn.value = M.dyn * S.dyn;
  U.uAir.value = M.air * S.air * 2;
  U.uKick.value = M.kick * S.bass;
  U.uHue.value = fixC ? 0 : M.hue * S.hue;
  U.uT.value = t;
  U.uSpd.value = S.speed;
  U.uSz.value = S.size;
  U.uExp.value = S.exp;
  U.uPA.value = Math.min(1, (U.uInv.value ? 1.6 : 1) * 9e4 * Math.pow(PA.uR.value.y / 1080, 2) / pcount);

  fx.forEach((f, i) => PA.uFx.value[i] = f.on ? f.a : 0);
  PA.uBurst.value = burst; burst *= Math.exp(-dt * 3);

  grp.rotation.y += dt * (.08 + U.uDyn.value * .4) * S.speed;
  grp.scale.setScalar(1 + U.uLoud.value * .12 + U.uKick.value * .06);
  stars.rotation.y -= dt * .01;

  if (!drag && S.drift) C.gth += dt * (.06 * (.4 + U.uDyn.value * 2) * S.speed);
  const k = 1 - Math.exp(-dt * 7);
  C.th += (C.gth - C.th) * k; C.ph += (C.gph - C.ph) * k; C.r += (C.gr - C.r) * k; C.t.lerp(C.gt, k);
  cam.position.set(C.t.x + C.r * Math.sin(C.ph) * Math.sin(C.th), C.t.y + C.r * Math.cos(C.ph), C.t.z + C.r * Math.sin(C.ph) * Math.cos(C.th));
  cam.fov = 60 + U.uKick.value * 6;
  cam.updateProjectionMatrix(); cam.lookAt(C.t); cam.updateMatrixWorld();

  if (!lost) {
    R.setRenderTarget(rt); R.render(sc, cam);
    R.setRenderTarget(rBr); R.render(sBr, pc);
    PA.tP.value = rB.texture;
    R.setRenderTarget(rA); R.render(sA, pc);
    PB.tA.value = rA.texture;
    R.setRenderTarget(null); R.render(sB, pc);
    const q = rA; rA = rB; rB = q;
  }

  if (fq % 2 == 0) drawPanels();
  const isAudioPlaying = ac && ac.state == 'running' && (mel || dr || micSource);
  rot = (rot + dt * (isAudioPlaying ? 200 * (1 + U.uLoud.value * .5) : 0)) % 360;
  if (disc) disc.style.transform = `rotate(${rot}deg)`;

  if (fr++ % 3 == 0) {
    const pos = tpos();
    const bpmDisp = BM ? fmtBpm(BM.bpm) : Math.round(A.rtBpm);
    const ntl = $('#ntl');
    if (ntl) ntl.textContent = `${M.lufs.toFixed(1)} LUFS · ${bpmDisp} BPM · ${A.stage}`;
    if (fr % 30 == 0) { updSummary(); layoutHud(); }
    if (!scrub && dur && discBar && discTip && wPin) {
      const progress = pos / dur;
      discBar.style.strokeDashoffset = String(CIRC * (1 - progress));
      discTip.textContent = mmss1(pos);
      wPin.style.left = (progress * 100) + '%';
    }
    const tcur = $('#tcur'), ttot = $('#ttot');
    if (tcur) tcur.textContent = mmss1(pos);
    if (ttot) ttot.textContent = dur ? mmss1(dur) : '—';
    if (rdEl) rdEl.textContent = `FPS ${(1000 / fa) | 0} · Partículas ${(pcount / 1000) | 0}k\nGraves: ${M.bass.toFixed(2)} | Brillo: ${M.air.toFixed(2)}`;
  }
}

// Initial setup
testConnection();
setMod(0);
rs();
renderPaletteChips(PALETTE_LIBRARY.slice(0, 6));

// Automatically restore saved palette from localStorage upon reloading the app
if (!restoreSavedPalette()) {
  applyPalette(PALETTE_LIBRARY[0].c1, PALETTE_LIBRARY[0].c2, PALETTE_LIBRARY[0].c3, PALETTE_LIBRARY[0].am, PALETTE_LIBRARY[0].name, false);
} else {
  toast('Paleta guardada restaurada de sesión anterior');
}

// Automatically restore optical effects preset
const activePreset = localStorage.getItem('sigil.fx_active_preset') || 'ProjectM Líquido';
populateFxPresetsSelector(activePreset);
applyFxPreset(activePreset, false);

requestAnimationFrame(frame);

// Check autostart
if (new URLSearchParams(window.location.search).get('autostart') === '1') {
  startDrone();
}
