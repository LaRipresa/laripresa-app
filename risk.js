import { TEAL, TEAL_D, WARM } from "./theme.js";

export const LAT=37.8421,LON=14.8970,COPPER_LIMIT=4.0;

export const PHENOLOGY = ["Dormance", "Gonflement", "Débourrement", "Pointe verte", "Feuilles étalées (3-4)", "Inflorescences visibles", "Boutons floraux séparés", "Pleine floraison", "Nouaison", "Petits pois", "Fermeture grappe", "Véraison", "Maturité", "Récolte"];

// ── Default products (editable) ───────────────────────────────────────────────
export const DEFAULT_PRODUCTS = [
  { id:"heliocuivre",  name:"Héliocuivre",  unit:"L",  cu:0.400, s:0,     col:WARM,    editable:false },
  { id:"biohealthram", name:"Biohealt Ram", unit:"kg", cu:0.060, s:0,     col:"#7A5230",editable:false },
  { id:"sulfar",       name:"Sulfar",       unit:"kg", cu:0,     s:0.900, col:"#8A7A20",editable:false },
];

export const CEPAGES_LIST=["Nerello Mascalese","Nerello Cappuccio","Grenache","Grecanico","Carricante","Catarratto","Minnella","Inzolia"];
export const CEP_SENS={
  "Nerello Mascalese":{peronospora:.85,mildew:.65,botrytis:.70},
  "Nerello Cappuccio":{peronospora:.80,mildew:.60,botrytis:.75},
  "Grenache":{peronospora:.70,mildew:.80,botrytis:.60},
  "Grecanico":{peronospora:.60,mildew:.75,botrytis:.75},
  "Carricante":{peronospora:.65,mildew:.60,botrytis:.80},
  "Catarratto":{peronospora:.60,mildew:.65,botrytis:.70},
  "Minnella":{peronospora:.55,mildew:.55,botrytis:.65},
  "Inzolia":{peronospora:.55,mildew:.60,botrytis:.70},
};

// ── Risk models ───────────────────────────────────────────────────────────────
export function computeRisk(w){
  if(!w)return null;
  const{temp,rh,rain3d,dewpoint}=w;
  let p=0;
  if(temp>11&&rain3d>10&&rh>85)p=.92;
  else if(temp>11&&rain3d>5&&rh>80)p=.68;
  else if(temp>11&&rain3d>2&&rh>75)p=.42;
  else if(temp>8&&rh>80)p=.22;
  if(temp>=18&&temp<=28)p=Math.min(1,p*1.2);
  else if(temp>30||temp<10)p*=.4;
  let o=0;
  if(temp>=17&&temp<=28&&rh>=40&&rain3d<5)o=.85;
  else if(temp>=14&&temp<=32&&rh>=35)o=.55;
  else if(temp>=10&&rh>=30)o=.25;
  if(rain3d<2&&temp>20)o=Math.min(1,o*1.15);
  let b=0;
  const wet=rh>90||(rh>80&&temp<dewpoint+3);
  if(temp>=15&&temp<=25&&wet)b=.85;
  else if(temp>=10&&temp<=30&&rh>85)b=.55;
  else if(rh>80&&temp>12)b=.30;
  return{peronospora:Math.min(1,p),mildew:Math.min(1,o),botrytis:Math.min(1,b)};
}
// Protection window: copper (Cu) → péronospora; sulfur (S) → mildew
// days 0-3: ~90% protection, day 7: ~50%, day 14: 0%, beyond: risk amplified
export function protectionCurve(days){
  if(days===null||days===undefined)return 0;
  if(days<=14) return Math.max(0,(1-days/14)*0.88); // 88% max protection at J+0
  return 0;
}
export function decayCurve(days){
  if(days===null||days===undefined||days<=10)return 0;
  return Math.min(0.40,(days-10)*0.07);
}
export function adjustedRisk(base, daysSinceCu, daysSinceS){
  if(!base) return base;
  // Per-disease protection factor
  const cuProt  = protectionCurve(daysSinceCu??null); // copper → péronospora
  const sProt   = protectionCurve(daysSinceS??null);  // sulfur → mildew + botrytis
  const cuDecay = decayCurve(daysSinceCu??null);
  const sDecay  = decayCurve(daysSinceS??null);
  return{
    peronospora: Math.min(1, Math.max(0, base.peronospora*(1-cuProt) + cuDecay*0.85)),
    mildew:      Math.min(1, Math.max(0, base.mildew*(1-sProt)       + sDecay*0.65)),
    botrytis:    Math.min(1, Math.max(0, base.botrytis*(1-sProt*0.6) + sDecay*0.50)),
  };
}
export function lv(score){
  if(score>=.75)return{label:"CRITIQUE",c:"#B83232",bg:"rgba(184,50,50,.09)"};
  if(score>=.50)return{label:"ÉLEVÉ",   c:"#C07828",bg:"rgba(192,120,40,.09)"};
  if(score>=.30)return{label:"MODÉRÉ",  c:"#A08010",bg:"rgba(160,128,16,.09)"};
  if(score>=.10)return{label:"FAIBLE",  c:TEAL_D,   bg:"rgba(30,155,138,.09)"};
  return             {label:"NUL",      c:"#9A9090", bg:"rgba(154,144,144,.06)"};
}
