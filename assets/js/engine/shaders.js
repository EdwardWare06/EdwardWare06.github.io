// All GLSL for the stage, ported from the approved prototype
// (.superpowers/brainstorm/3695-1790297377/content/intro-lab.html).
export const HDR = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
export const VSQ = HDR + 'const vec2 Q[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));void main(){gl_Position=vec4(Q[gl_VertexID],0.,1.);}';

const HASH = 'float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}\n';
const COMMON = HASH + `
vec3 rdir(float a,float b){float z=a*2.-1.;float r=sqrt(max(0.,1.-z*z));float ph=b*6.2831853;return vec3(r*cos(ph),z,r*sin(ph));}
vec4 H4(ivec2 id){vec2 q=vec2(id);return vec4(hash(q),hash(q+17.3),hash(q+41.1),hash(q+83.7));}
vec3 abc(vec3 p){return vec3(sin(p.z)+.43*cos(p.y),.7*sin(p.x)+cos(p.z),.43*sin(p.y)+.7*cos(p.x));}
const float TL=.42;
vec3 tiltW(vec3 v){float c=cos(TL),s=sin(TL);return vec3(v.x,v.y*c-v.z*s,v.y*s+v.z*c);}
vec3 tiltL(vec3 v){float c=cos(TL),s=sin(TL);return vec3(v.x,v.y*c+v.z*s,-v.y*s+v.z*c);}
float ringA(vec4 h){return 1.35+h.y*.6;}
// black hole: each particle keeps its own orbit, most of them close to the shadow
float diskR(vec4 h){return .26+2.34*pow(h.y,1.5);}
// brain: hemisphere centres and radii
const vec3 BR=vec3(.5,.64,1.);
vec3 bctr(float sd){return vec3(sd*.28,.06,0.);}
`;
const NOISE = `vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
vec2 curl(vec2 p,float t){const float e=.02;float a=snoise(vec3(p.x,p.y+e,t)),b=snoise(vec3(p.x,p.y-e,t)),c=snoise(vec3(p.x+e,p.y,t)),d=snoise(vec3(p.x-e,p.y,t));return vec2(a-b,-(c-d))/(2.*e);}
float sheetY(vec2 q,float t){return .22*sin(q.x*1.3+t*.2)*cos(q.y*1.1-t*.15)+.1*sin(q.x*2.9-q.y*2.1+t*.3);}
`;

// Update: one fragment per particle, MRT out (position+birth, velocity+age).
export const UPDATE_FS = HDR + `uniform sampler2D uP,uV,uBrain;uniform float uT,uDt,uMix,uTurb,uReset,uSing,uKick;uniform int uF0,uF1;uniform vec3 uM;
layout(location=0) out vec4 oP;layout(location=1) out vec4 oV;
${COMMON}${NOISE}
vec3 field(int f,vec3 p,vec3 v,vec4 h,ivec2 id){
  // 0: brain (targets built once by BRAIN_FS; a slow breath)
  if(f==0)return (texelFetch(uBrain,id,0).xyz*(1.+.01*sin(uT*1.3))-p)*7.;
  if(f==1){vec2 q=p.xz*.75;vec2 c=curl(q,uT*.04)+.45*curl(q*2.6+9.,uT*.07)+vec2(.55,0.);vec3 fl=vec3(c.x*.2,(sheetY(p.xz,uT)-p.y)*3.,c.y*.2);
    vec3 hm=vec3((h.y*2.-1.)*2.4,0.,(h.z*2.-1.)*1.8);hm.y=sheetY(hm.xz,uT);float settle=uF1==1?smoothstep(.85,1.,uMix):1.;return mix((hm-p)*6.,fl,settle);}
  if(f==2){float r=max(length(p.xz),.05);vec3 tn=vec3(-p.z,0.,p.x)/r;vec3 rn=vec3(p.x,0.,p.z)/r;float vk=.95/sqrt(max(r,.25));float hy=(h.z-.5)*.05*r;return tn*vk+rn*(diskR(h)-r)*1.2+vec3(0.,(hy-p.y)*4.,0.);}
  if(f==3){
    vec3 m=uM;
    if(h.x<.08){vec3 tg=rdir(h.y,h.z)*.07;return (tg-p)*10.;}
    if(h.x<.2){return normalize(v+vec3(1e-4,0.,0.))*4.;}
    if(h.x<.9){vec3 e1=normalize(cross(m,vec3(0.,1.,0.)));vec3 e2=cross(m,e1);float L=.3+h.y*1.3;float tmin=asin(sqrt(.07/L));
      float th=tmin+fract(h.z*7.+uT*.12/L)*(3.14159265-2.*tmin);float ph=h.w*6.2831853;float r=L*sin(th)*sin(th);
      vec3 tg=r*(sin(th)*cos(ph)*e1+sin(th)*sin(ph)*e2+cos(th)*m);return (tg-p)*9.;}
    float an=h.y*6.2831853+uT*.6;float rr=.55+h.z*.45;vec3 tg=vec3(cos(an)*rr,(h.w-.5)*.04,sin(an)*rr);return (tg-p)*5.;
  }
  if(f==4){
    if(h.x<.16){vec3 d=rdir(h.z,h.w)*.3*pow(h.y*.85+.15,.8);d.y*=.55;float c=cos(uT*.35),s=sin(uT*.35);vec3 tg=vec3(d.x*c-d.z*s,d.y,d.x*s+d.z*c);return (tg-p)*6.;}
    float a=.12+2.*pow(h.y,1.5);float e=.3+.12*(h.w-.5);float b=a*(1.-e);float ph=a*2.3;float w=.42/(a+.3);float th=h.z*6.2831853+uT*w;
    vec2 q=vec2(a*cos(th),b*sin(th));float c=cos(ph),s=sin(ph);vec2 r=vec2(q.x*c-q.y*s,q.x*s+q.y*c);
    float y=(hash(vec2(id)*3.7)-.5)*.06*(1.+.8*exp(-a*3.));return (vec3(r.x,y,r.y)-p)*6.;
  }
  if(f==5){
    if(h.x<.22){float a=ringA(h);float w=.25/pow(a,1.5);float th=h.z*6.2831853+uT*w;vec3 rp=tiltW(vec3(cos(th)*a,(h.w-.5)*.012,sin(th)*a));return (rp-p)*6.;}
    // flowing bands; storms come from the surface curl of ONE scalar noise, which is divergence-free on the sphere
    const float R=.95;vec3 hm=tiltW(rdir(h.y,h.z)*R);
    vec3 lp=tiltL(p);float L=max(length(lp),1e-4);vec3 n=lp/L;float lat=asin(clamp(n.y,-1.,1.));
    vec3 east=cross(vec3(0.,1.,0.),n);float el=length(east);east=el>1e-4?east/el:vec3(1.,0.,0.);
    float jet=.5*sin(lat*7.)+.18*sin(lat*13.+1.);
    vec3 q=n*2.2+vec3(uT*.05,0.,uT*.03);const float e=.04;float s0=snoise(q);
    vec3 gr=vec3(snoise(q+vec3(e,0.,0.))-s0,snoise(q+vec3(0.,e,0.))-s0,snoise(q+vec3(0.,0.,e))-s0)/e;
    vec3 vl=east*jet*.5+cross(n,gr)*.065+n*(R+.012*(h.w-.5)-L)*6.;
    float settle=uF1==5?smoothstep(.85,1.,uMix):1.;return mix((hm-p)*8.,tiltW(vl),settle);
  }
  // 6: singularity
  vec3 tg=rdir(h.y,h.z)*uSing*pow(h.w,.33);return (tg-p)*14.;
}
void main(){ivec2 id=ivec2(gl_FragCoord.xy);vec4 P=texelFetch(uP,id,0),V=texelFetch(uV,id,0);vec3 p=P.xyz,v=V.xyz;float age=uReset>.5?0.:V.w+uDt;float pw=P.w;vec4 h=H4(id);
  float mm=(uF1==0||uF1==1||uF1==5)?smoothstep(0.,.6,uMix):uMix;
  vec3 Vd=mix(field(uF0,p,v,h,id),field(uF1,p,v,h,id),mm);
  Vd+=abc(p*2.3+uT*.2)*uTurb;
  bool beam=(uF1==3&&h.x>=.08&&h.x<.2&&uMix>.6);
  float ks=beam?30.:mix(5.,120.,smoothstep(.6,1.,uMix));
  v+=(Vd-v)*(1.-exp(-uDt*ks));
  if(uKick>0.){v+=normalize(p+rdir(h.y,h.z)*.01)*uKick*(.5+h.w);}
  p+=v*uDt;
  if(uMix>.99){
    if(uF1==1){if(abs(p.x)>2.6||abs(p.z)>2.||age>3.+h.w*6.){vec2 r2=vec2(hash(vec2(id)+fract(uT)*5.),hash(vec2(id)*.7+fract(uT)*3.));p.xz=(r2*2.-1.)*vec2(2.6,2.);if(hash(vec2(id)*1.9+fract(uT))<.3)p.x=-2.6+r2.x*.3;p.y=sheetY(p.xz,uT);age=0.;pw=uT;}}
    if(uF1==2){float r=length(p.xz);if(r>4.){float rr=diskR(h);float an=hash(vec2(id)+fract(uT)*91.)*6.2831853;p=vec3(cos(an)*rr,(h.z-.5)*.03*rr,sin(an)*rr);v=vec3(-sin(an),0.,cos(an))*.95/sqrt(rr);age=0.;pw=uT;}}
    if(uF1==5&&h.x>=.22&&age>6.+h.w*8.){p=tiltW(rdir(hash(vec2(id)+fract(uT)*17.),hash(vec2(id)*.9+fract(uT)*29.))*.95);v=vec3(0.);age=0.;pw=uT;}
  }
  if(beam&&(age>h.y*.5+.35||length(p)>3.5)){float sg=h.z<.5?-1.:1.;vec3 d=normalize(uM*sg+rdir(hash(vec2(id)+fract(uT)*13.),hash(vec2(id)*1.3+fract(uT)*7.))*.035);p=d*(.08+hash(vec2(id)*2.3+fract(uT)*11.)*.3);v=d*4.;age=0.;pw=uT;}
  if(!(dot(p,p)<400.)){p=rdir(h.y,h.z)*.5;v=vec3(0.);}
  oP=vec4(p,pw);oV=vec4(v,age);}`;

// Render: one point per particle, with point-lens gravitational lensing for the black hole.
export const RENDER_VS = HDR + `uniform sampler2D uP,uV;uniform int uW,uF0,uF1,uImg;uniform float uMix,uAsp,uPt,uI,uDist,uFoc,uLens,uThE,uOff,uT;uniform mat3 uR;uniform vec3 uFwd,uSun;uniform vec4 uFl[6];uniform float uFi[6];out vec3 vC;
${COMMON}
vec3 colF(int f,vec3 p,vec3 v,vec4 h){
  float sp=length(v);
  if(f==0){
    if(h.x<.62){float sd=p.x<0.?-1.:1.;vec3 d=normalize((p-bctr(sd))/BR);bool line=h.w*2.-floor(h.w*2.)<.72;float front=smoothstep(.35,-.45,dot(d,uFwd));vec3 c=mix(vec3(.42,.56,1.),vec3(.72,.9,1.),smoothstep(-.35,.55,p.y))*(line?1.:.22)*mix(.22,1.,front);float spark=step(.985,fract(uT*.6+h.w*37.))*step(fract(h.y*91.),.4);return c+vec3(.8,1.,.4)*spark*2.*front;}
    if(h.x<.86){float k=floor(h.y*40.),ph=hash(vec2(k,3.3));bool surf=hash(vec2(k,5.))<.5;float on=step(fract(uT*.22+ph),.55);float w=fract(h.z-uT*.9-ph*7.);float pulse=on*smoothstep(.86,1.,w);float node=smoothstep(.05,0.,min(h.z,1.-h.z));return vec3(.5,.3,1.)*(surf?.34:.22)+vec3(.78,1.,.45)*pulse*(surf?3.4:2.8)+vec3(.8,.9,1.)*node*1.1;}
    return mix(vec3(.3,.3,.85),vec3(.5,.7,1.),h.z)*.45;}
  if(f==1){float an=atan(v.z,v.x);vec3 c=mix(vec3(.10,.22,1.),vec3(.45,.82,1.),smoothstep(.1,.5,sp));c=mix(c,vec3(.78,.94,.19),smoothstep(.55,1.,sin(an*2.+p.z*3.)*.5+.5)*.45);float edge=smoothstep(2.6,1.7,abs(p.x))*smoothstep(2.,1.2,abs(p.z));return mix(c,vec3(.55,.3,1.),smoothstep(.3,-.2,p.y)*.35)*.9*edge;}
  if(f==2){float r=length(p.xz);vec3 c=mix(vec3(1.,.9,.72),vec3(1.,.5,.16),smoothstep(.35,1.,r));c=mix(c,vec3(.55,.12,.04),smoothstep(1.1,2.4,r));float be=clamp(dot(v,-uFwd)*.35,-.8,.8);c*=pow(1.+be,3.);c=mix(c,c*vec3(.8,.9,1.25),max(be,0.));return c*.55;}
  if(f==3){if(h.x<.08)return vec3(2.);if(h.x<.2)return vec3(.6,.88,1.)*1.1;if(h.x<.9){float d=length(p);return mix(vec3(.75,.7,1.),vec3(.4,.45,1.),smoothstep(.1,1.2,d))*1.35;}return vec3(.78,.94,.19)*.55;}
  if(f==4){if(h.x<.16)return vec3(1.,.82,.55)*1.3;float a=.12+2.*pow(h.y,1.5);vec3 c=mix(vec3(1.,.9,.75),vec3(.45,.65,1.),smoothstep(.2,1.2,a));if(h.w>.985)c=vec3(1.,.35,.7)*2.2;return c*.85;}
  if(f==5){
    if(h.x<.22){float a=ringA(h);float gap=smoothstep(.15,.55,abs(sin(a*24.)));float day=.35+.65*smoothstep(-.3,.4,dot(normalize(p),uSun));return vec3(.78,.84,1.)*(.35+1.1*gap)*(a<1.47?.45:1.)*day;}
    vec3 n=normalize(tiltL(p));float lat=asin(clamp(n.y,-1.,1.));float b=.5+.5*sin(lat*14.+sin(lat*5.)*1.5);
    vec3 c=mix(vec3(.10,.18,.7),vec3(.5,.78,1.),b);c=mix(c,vec3(.8,.95,.4),smoothstep(.9,1.,sin(lat*9.+2.))*.35);
    vec3 nw=normalize(p);float day=.14+.86*smoothstep(-.2,.45,dot(nw,uSun));
    float fl=0.;for(int i=0;i<6;i++){float ag=uT-uFl[i].w;if(ag<0.||ag>1.2)continue;float an=1.-dot(nw,uFl[i].xyz);fl+=uFi[i]*exp(-ag*6.)*exp(-an*(70./uFi[i]))*(.6+.4*sin(ag*70.+float(i)*1.7));}
    return c*day*.9+vec3(.75,.88,1.)*fl*5.;
  }
  return vec3(.75,.86,1.)*.3; // 6: singularity
}
void main(){ivec2 id=ivec2(gl_VertexID%uW,gl_VertexID/uW);vec4 P=texelFetch(uP,id,0),V=texelFetch(uV,id,0);vec3 p=P.xyz,v=V.xyz;vec4 h=H4(id);
  vec3 q=uR*p;float z=q.z+uDist;gl_PointSize=uPt;vC=vec3(0.);
  if(z<.2||(uImg==1&&uLens<.01)){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec2 s=q.xy/z*uFoc;float amp=1.;
  // first image: the far side is pushed outward, over the shadow; second image: a thin ring on the shadow's edge, on the opposite side
  if(uLens>.01){float b=length(s)+1e-5;float TH=uThE*uLens;
    if(uImg==0){float th=TH*smoothstep(-.15,.4,q.z);s*=((b+sqrt(b*b+4.*th*th))*.5)/b;}
    else{float u=(sqrt(b*b+4.*TH*TH)-b)*.5/TH;s*=-TH*(.84+.1*u)/b;amp=.45*u*sqrt(clamp(abs(q.z)/.4,0.,1.))*(q.z>0.?1.:.15);}}
  vec3 c=mix(colF(uF0,p,v,h),colF(uF1,p,v,h),uMix);
  float dep=smoothstep(uDist+3.,uDist-2.,z);
  bool bm=(uF1==3&&h.x>=.08&&h.x<.2);float db=uT-P.w;float fin=(P.w<0.||db<0.)?1.:smoothstep(0.,bm?.06:.5,db);
  float fout=(uF1==5&&h.x>=.22&&uMix>.99)?smoothstep(6.+h.w*8.,5.4+h.w*8.,V.w):1.;
  vC=c*uI*(.25+.75*dep)*amp*fin*fout;
  gl_Position=vec4(s.x/uAsp+uOff,s.y,0.,1.);}`;

// Brain targets: one texel per particle, built once per state allocation (they depend only on the particle id).
// Folded cortex on meandering rings, neuron fibres (quadratic curves between points on the cortex), cerebellum, stem.
export const BRAIN_FS = HDR + `out vec4 o;
${COMMON}
vec3 bdir(float k,float j){return rdir(.25+.7*hash(vec2(k,j*7.1+1.3)),hash(vec2(k*1.7,j+4.2)));}
vec3 fibre(float k,float s){float sd=hash(vec2(k,9.))<.5?-1.:1.;vec3 d1=bdir(k,0.);vec3 a,b,c;
  if(hash(vec2(k,5.))<.5){vec3 d2=normalize(d1+(rdir(hash(vec2(k,2.2)),hash(vec2(k,3.7)))*.7));a=bctr(sd)+d1*BR*.99;b=bctr(sd)+d2*BR*.99;c=bctr(sd)+normalize(d1+d2)*BR*1.05;}
  else{a=bctr(sd)+d1*BR*.9;b=bctr(-sd)+bdir(k,1.)*BR*.9;c=(a+b)*.2+vec3(0.,.12,0.);}
  float u=1.-s;return u*u*a+2.*u*s*c+s*s*b;}
void main(){ivec2 id=ivec2(gl_FragCoord.xy);vec4 h=H4(id);vec3 tg;float sd=h.w<.5?-1.:1.;
  if(h.x<.62){vec3 d=rdir(h.y,h.z);
    if(h.w*2.-floor(h.w*2.)<.72){float j=floor(h.y*26.);float th=h.z*6.2831853;float ph=mix(.2,2.94,(j+.5)/26.)+.14*sin(th*8.+j*2.1)+.06*sin(th*15.+j*.7);d=vec3(sin(ph)*cos(th),sin(ph)*sin(th),cos(ph));d+=rdir(fract(h.w*31.),fract(h.w*17.))*.012;d=normalize(d);}
    tg=bctr(sd)+d*BR*(1.-.012*fract(h.w*13.));tg.x=sd*max(sd*tg.x,.03);if(tg.y<-.36)tg.y=-.36+(tg.y+.36)*.35;}
  else if(h.x<.86){float k=floor(h.y*40.);tg=fibre(k,h.z)+rdir(h.w,fract(h.y*57.))*.009;}
  else if(h.x<.95){vec3 d=rdir(h.y,h.z);tg=vec3(0.,-.44,-.72)+d*vec3(.42,.21,.28)*(1.-.07*abs(sin(d.y*26.))-.04*fract(h.w*7.));}
  else{float sv=h.y;float an=h.z*6.2831853;float r=.1*(1.-.35*sv)*(1.-.3*fract(h.w*5.));tg=mix(vec3(0.,-.38,-.3),vec3(0.,-1.,-.42),sv)+vec3(cos(an)*r,0.,sin(an)*r);}
  o=vec4(tg,1.);}`;

export const POINT_FS = HDR + 'in vec3 vC;out vec4 o;void main(){o=vec4(vC,1.);}';
export const FADE_FS = HDR + 'uniform float uF;out vec4 o;void main(){o=vec4(uF);}';

// Display: bloom from the mip chain, tone map, nebula dust, stars, vignette, grain, flash pulse.
export const DISPLAY_FS = HDR + `uniform sampler2D uAcc;uniform vec2 uRes,uSky;uniform float uExp,uT,uBloom,uFlash,uSkyA,uDim;out vec4 o;${HASH}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 a=textureLod(uAcc,uv,0.).rgb;vec3 b=textureLod(uAcc,uv,1.5).rgb*.45+textureLod(uAcc,uv,3.).rgb*.35+textureLod(uAcc,uv,4.5).rgb*.25;
  vec3 e=a+b*uBloom;vec2 sp=uv*vec2(uRes.x/uRes.y,1.)*2.2+uSky;float n=fbm(sp*1.3),n2=fbm(sp*2.7+7.);
  vec3 col=vec3(.003,.005,.012)+vec3(.018,.01,.045)*pow(n,3.)*4.+vec3(0.,.02,.03)*pow(n2,4.)*3.;
  vec2 g=gl_FragCoord.xy+uSky*uRes.y*.5;vec2 cell=floor(g/3.);float hs=hash(cell);
  float st=step(.9972,hs)*(.3+.7*hash(cell+3.1))*(.65+.35*sin(uT*(1.+hash(cell+9.)*3.)+hs*60.))*step(length(fract(g/3.)-.5),.36);
  col=(col+st*vec3(.75,.82,1.))*uSkyA+(1.-exp(-e*uExp))*uDim+vec3(.35,.55,1.)*uFlash*.07;
  float vg=length(uv-.5);col*=1.-.55*vg*vg;col+=(hash(gl_FragCoord.xy+fract(uT*.37)*517.)-.5)*.02;o=vec4(col,1.);}`;
