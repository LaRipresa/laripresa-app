import { useState, useEffect, useCallback, useRef } from "react";
import IMG_VINE from "./vine.jpg";
import IMG_LOGO from "./logo.png";
import IMG_BOTT from "./bott.jpg";
import { TEAL, TEAL_D, INK, PARCH, PARCH2, STONE, MID, WARM, css } from "./theme.js";
import { Col, Box, Stat, Info, F, TxtBtn, PriBtn, SecBtn, SeasonPick, yearsOf } from "./ui.jsx";
import { t } from "./i18n.js";
import { LAT, LON, COPPER_LIMIT, PHENOLOGY, DEFAULT_PRODUCTS, CEPAGES_LIST, CEP_SENS, computeRisk, adjustedRisk, lv } from "./risk.js";
import { exportParcelPDF, exportWeeklyPDF, exportAllTreatmentsPDF, exportAIAnalysisPDF } from "./pdf.js";
import { K, SESSION_KEY, getSession, loadStore, isDeployed, api, apiAuth } from "./store.js";
import { useSync } from "./useSync.js";
import { stockOf, lowStock } from "./stock.js";
import Travaux, { tasksDue } from "./Travaux.jsx";
import Achats from "./Achats.jsx";
import Station, { stationWeather } from "./Station.jsx";
import Compte, { syncLabel, syncColor } from "./Compte.jsx";

const GFONT = document.createElement("link");
GFONT.rel = "stylesheet";
GFONT.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap";
document.head.appendChild(GFONT);

export default function App(){
  const stored=loadStore();
  const[session,setSession_]=useState(()=>getSession());
  const setSession=s=>{setSession_(s);if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY);};
  const[loginView,setLoginView]=useState(!getSession());
  const[loginEmail,setLoginEmail]=useState("");
  const[loginCode,setLoginCode]=useState("");
  const[loginStep,setLoginStep]=useState("email");
  const[loginLoading,setLoginLoading]=useState(false);
  const[loginError,setLoginError]=useState("");
  const[devCode,setDevCode]=useState("");
  const saveTimerRef=useRef(null);
  const[tab,setTab]=useState("home");
  const[lang,setLang]=useState(stored.lang||"fr");
  const[weather,setWeather]=useState(null);
  const[forecast,setForecast]=useState([]);
  const[wLoading,setWLoading]=useState(true);
  const[wError,setWError]=useState(null);
  const[parcelles,setParcelles]=useState(stored.parcelles||[]);
  const[treatments,setTreatments]=useState(stored.treatments||[]);
  const[absences,setAbsences]=useState(stored.absences||[]);
  const[observations,setObservations]=useState(stored.observations||[]);
  const[products,setProducts]=useState(stored.products||DEFAULT_PRODUCTS);
  const[user,setUser]=useState(stored.user||{name:"",email:"",phone:""});
  // Travail au long cours, achats, station météo
  const[works,setWorks]=useState(stored.works||[]);
  const[projects,setProjects]=useState(stored.projects||[]);
  const[tasks,setTasks]=useState(stored.tasks||[]);
  const[invoices,setInvoices]=useState(stored.invoices||[]);
  const[stockCounts,setStockCounts]=useState(stored.stockCounts||[]);
  const[stations,setStations]=useState(stored.stations||[]);
  const[settings,setSettings]=useState(stored.settings||{});
  const[season,setSeason]=useState(new Date().getFullYear()); // campagne affichée
  const[stationViews,setStationViews]=useState({});
  const[loginMode,setLoginMode]=useState("email");
  const[toast,setToast]=useState(null);
  const[aiText,setAiText]=useState(null);
  const[aiLoading,setAiLoading]=useState(false);
  // forms
  const[showPF,setShowPF]=useState(false);
  const[showTF,setShowTF]=useState(false);
  const[showAF,setShowAF]=useState(false);
  const[showOF,setShowOF]=useState(null); // parcelleId
  const[showProdF,setShowProdF]=useState(false);
  const[editParcel,setEditParcel]=useState(null); // parcel being edited
  const[expandedP,setExpandedP]=useState(null);
  const[expandedT,setExpandedT]=useState(null); // treatment id
  const[pForm,setPForm]=useState({name:"",lat:"",lon:"",superficie:"1",cepages:[],parentId:null});
  const[tForm,setTForm]=useState({parcelleId:"",date:new Date().toISOString().slice(0,10),productId:"heliocuivre",disease:"Péronospora",dose:"",notes:""});
  const[aForm,setAForm]=useState({start:"",end:"",destination:""});
  const[oForm,setOForm]=useState({date:new Date().toISOString().slice(0,10),stage:"",text:"",brix:"",ph:"",ta:"",weight:""});
  const[prodForm,setProdForm]=useState({name:"",unit:"L",cu_per_L:"",s_per_unit:""});

  const T=(key,...args)=>t(lang,key,...args);
  const today=new Date().toISOString().slice(0,10);
  const baseRisks=computeRisk(weather);
  const currentAbsence=absences.find(a=>a.start<=today&&a.end>=today);
  const nextAbsence=absences.filter(a=>a.start>today).sort((a,b)=>a.start.localeCompare(b.start))[0];

  // ── Sauvegarde : sur l'appareil à chaque modification, puis dans le cloud du compte connecté ──
  const sync=useSync({
    session,
    data:{parcelles,treatments,absences,observations,products,works,projects,tasks,invoices,stockCounts,stations,user,lang,settings},
    apply:d=>{
      setParcelles(d.parcelles||[]);setTreatments(d.treatments||[]);setAbsences(d.absences||[]);setObservations(d.observations||[]);
      setProducts(d.products?.length?d.products:DEFAULT_PRODUCTS);
      setWorks(d.works||[]);setProjects(d.projects||[]);setTasks(d.tasks||[]);setInvoices(d.invoices||[]);setStockCounts(d.stockCounts||[]);setStations(d.stations||[]);
      if(d.user)setUser(d.user);if(d.lang)setLang(d.lang);if(d.settings)setSettings(d.settings);
    },
    onAuthLost:()=>{setSession(null);setLoginView(true);},
  });

  useEffect(()=>{if("serviceWorker" in navigator&&isDeployed())navigator.serviceWorker.register("/sw.js").catch(()=>{});},[]);

  // ── Station(s) météo : relevés lus à l'ouverture puis toutes les 15 minutes ──
  const stationsRef=useRef(stations);stationsRef.current=stations;
  const loadStations=useCallback(async(refresh)=>{
    if(!isDeployed()||!getSession()?.token||!stationsRef.current.length)return;
    const out={};
    await Promise.all(stationsRef.current.map(async st=>{try{out[st.id]=await api(`/api/station?id=${st.id}${refresh===true?"&refresh=1":""}`);}catch{}}));
    setStationViews(v=>({...v,...out}));
  },[]);
  useEffect(()=>{loadStations();const iv=setInterval(loadStations,15*60*1000);return()=>clearInterval(iv);},[stations.map(x=>x.id).join(","),session?.token]);

  // ── Weather ─────────────────────────────────────────────────────────────────
  const fetchWeather=useCallback(async()=>{
    setWLoading(true);setWError(null);
    try{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,dew_point_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,wind_speed_10m_max,weather_code&forecast_days=10&timezone=Europe%2FRome&wind_speed_unit=kmh`;
      const r=await fetch(url);
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const c=d.current;
      if(!c)throw new Error("Données vides");
      const wmoDesc=code=>{
        if(code<=1)return"Clair";if(code<=3)return"Nuageux";
        if(code<=49)return"Brouillard";if(code<=59)return"Bruine";
        if(code<=69)return"Pluie";if(code<=79)return"Neige";
        if(code<=82)return"Averses";if(code<=86)return"Neige";
        if(code<=99)return"Orages";return"";
      };
      const rain3d=(d.daily?.precipitation_sum||[]).slice(0,3).reduce((s,v)=>s+(v||0),0);
      setWeather({temp:parseFloat(c.temperature_2m?.toFixed(1)),rh:parseFloat(c.relative_humidity_2m),rain3d:parseFloat(rain3d.toFixed(1)),wind:parseFloat(c.wind_speed_10m?.toFixed(1)),dewpoint:parseFloat(c.dew_point_2m?.toFixed(1)),desc:wmoDesc(c.weather_code||0)});
      const daily=d.daily;
      setForecast((daily?.time||[]).map((date,i)=>({date,tmax:daily.temperature_2m_max?.[i]??0,tmin:daily.temperature_2m_min?.[i]??0,rain:parseFloat((daily.precipitation_sum?.[i]||0).toFixed(1)),rh:daily.relative_humidity_2m_max?.[i]??60,desc:wmoDesc(daily.weather_code?.[i]||0)})));
    }catch(e){setWError("Météo indisponible — "+e.message);}
    finally{setWLoading(false);}
  },[]);
  useEffect(()=>{fetchWeather();},[fetchWeather]);

  const notify=(msg,silent)=>{if(!silent){setToast(msg);setTimeout(()=>setToast(null),3200);}};

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const lastTreat=pid=>treatments.filter(t=>String(t.parcelleId)===String(pid)).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const daysSince=pid=>{const l=lastTreat(pid);return l?Math.floor((Date.now()-new Date(l.date).getTime())/86400000):null;};
  // Days since last copper treatment (péronospora)
  const daysSinceCu=pid=>{
    const cuProds=products.filter(p=>p.cu>0).map(p=>p.id);
    const ts=treatments.filter(t=>String(t.parcelleId)===String(pid)&&cuProds.includes(t.productId||t.product)).sort((a,b)=>b.date.localeCompare(a.date));
    return ts[0]?Math.floor((Date.now()-new Date(ts[0].date).getTime())/86400000):null;
  };
  // Days since last sulfur treatment (mildew)
  const daysSinceS=pid=>{
    const sProds=products.filter(p=>p.s>0).map(p=>p.id);
    const ts=treatments.filter(t=>String(t.parcelleId)===String(pid)&&sProds.includes(t.productId||t.product)).sort((a,b)=>b.date.localeCompare(a.date));
    return ts[0]?Math.floor((Date.now()-new Date(ts[0].date).getTime())/86400000):null;
  };
  const stationFor=pid=>{const p=parcelles.find(x=>String(x.id)===String(pid));const ids=[String(pid)];if(p?.parentId!=null)ids.push(String(p.parentId));return stations.find(st=>ids.includes(String(st.parcelleId)));};
  const wxFor=pid=>{const st=stationFor(pid);return(st&&stationWeather(stationViews[st.id],weather))||weather;};
  const baseFor=pid=>computeRisk(wxFor(pid));
  const parcelRisk=pid=>adjustedRisk(baseFor(pid),daysSinceCu(pid),daysSinceS(pid));
  const riskAtReturn=(pid,abs)=>{
    if(!abs||!baseRisks)return null;
    const dUR=Math.ceil((new Date(abs.end)-new Date())/86400000);
    const dsCu=daysSinceCu(pid); const dsS=daysSinceS(pid);
    return adjustedRisk(baseFor(pid), dsCu!==null?dsCu+dUR:null, dsS!==null?dsS+dUR:null);
  };
  const cuStats=(pid,year)=>{
    const yr=String(year||new Date().getFullYear());
    const ts=treatments.filter(t=>String(t.parcelleId)===String(pid)&&t.date.startsWith(yr));
    const total=ts.reduce((s,t)=>s+(t.cu_applied||0),0);
    const parc=parcelles.find(p=>p.id===pid||String(p.id)===String(pid));
    const limit=(parc?.superficie||1)*COPPER_LIMIT;
    return{total,limit,pct:Math.min(100,total/limit*100),rem:limit-total};
  };
  const getRecs=pid=>{
    const risk=parcelRisk(pid);if(!risk)return[];
    const days=daysSince(pid)??999;
    const parc=parcelles.find(p=>p.id===pid||String(p.id)===String(pid));
    const maxSens=d=>{const ceps=parc?.cepages||[];return ceps.length?Math.max(...ceps.map(c=>CEP_SENS[c]?.[d]||.6)):1;};
    const out=[];
    const pS=Math.min(1,risk.peronospora*maxSens("peronospora"));
    const oS=Math.min(1,risk.mildew*maxSens("mildew"));
    const bS=Math.min(1,risk.botrytis*maxSens("botrytis"));
    if(pS>=.40||(pS>=.25&&days>10))out.push({d:"Péronospora",pid:"heliocuivre",score:pS,urgent:pS>=.65,days});
    if(oS>=.40||(oS>=.25&&days>12))out.push({d:"Oïdium",pid:"sulfar",score:oS,urgent:oS>=.65,days});
    if(bS>=.50)out.push({d:"Botrytis",pid:"biohealthram",score:bS,urgent:bS>=.65,days});
    return out;
  };
  const getProduct=id=>products.find(p=>p.id===id)||products[0];
  const daysLeft=pid=>{
    const dsCu=daysSinceCu(pid); const dsS=daysSinceS(pid);
    const minDays=Math.min(dsCu??999, dsS??999);
    return minDays===999?null:Math.max(0,14-minDays);
  };

  // ── Add parcelle ────────────────────────────────────────────────────────────
  const addParcelle=()=>{
    if(!pForm.name.trim())return;
    const isEdit=!!editParcel;
    if(isEdit){
      setParcelles(prev=>prev.map(p=>String(p.id)===String(editParcel)?{...p,...pForm,superficie:parseFloat(pForm.superficie)||1}:p));
    }else{
      setParcelles(p=>[...p,{...pForm,id:Date.now(),superficie:parseFloat(pForm.superficie)||1}]);
    }
    setPForm({name:"",lat:"",lon:"",superficie:"1",cepages:[],parentId:null});
    setShowPF(false);setEditParcel(null);
    notify(isEdit?"Parcelle mise à jour":"Parcelle créée");
    setTimeout(()=>syncNow(),100);
  };
  const startEditParcel=p=>{
    setPForm({name:p.name,lat:p.lat||"",lon:p.lon||"",superficie:String(p.superficie),cepages:p.cepages||[],parentId:p.parentId||null});
    setEditParcel(p.id);setShowPF(true);setTab("parcels");
  };

  // ── Add treatment ───────────────────────────────────────────────────────────
  const addTreatment=()=>{
    if(!tForm.parcelleId||!tForm.dose)return;
    const prod=getProduct(tForm.productId);
    const dose=parseFloat(tForm.dose)||0;
    const parc=parcelles.find(p=>String(p.id)===String(tForm.parcelleId));
    const surf=parc?.superficie||1;
    const cu=parseFloat((dose*prod.cu*surf).toFixed(4));
    const s=parseFloat((dose*prod.s*surf).toFixed(4));
    setTreatments(prev=>[...prev,{...tForm,id:Date.now(),dose,cu_applied:cu,s_applied:s,superficie:surf,productName:prod.name,unit:prod.unit}].sort((a,b)=>b.date.localeCompare(a.date)));
    setShowTF(false);
    notify(`Enregistré · Cu:${cu.toFixed(3)}kg · S:${s.toFixed(3)}kg`);
    sync.flush();
  };

  // ── Add observation ─────────────────────────────────────────────────────────
  const addObservation=pid=>{
    setObservations(prev=>[...prev,{...oForm,id:Date.now(),parcelleId:pid}].sort((a,b)=>b.date.localeCompare(a.date)));
    setOForm({date:new Date().toISOString().slice(0,10),stage:"",text:"",brix:"",ph:"",ta:"",weight:""});
    setShowOF(null);notify("Observation enregistrée");
    setTimeout(()=>syncNow(),100);
  };

  // ── Add product ─────────────────────────────────────────────────────────────
  const addProduct=()=>{
    if(!prodForm.name)return;
    const cu=parseFloat(prodForm.cu_per_L)||0;
    const s=parseFloat(prodForm.s_per_unit)||0;
    setProducts(prev=>[...prev,{id:"custom_"+Date.now(),name:prodForm.name,unit:prodForm.unit,cu:cu/1000,s:s/1000,col:TEAL,editable:true}]);
    setProdForm({name:"",unit:"L",cu_per_L:"",s_per_unit:""});setShowProdF(false);
    notify("Produit ajouté");
  };

  // ── Add absence ─────────────────────────────────────────────────────────────
  const addAbsence=()=>{
    if(!aForm.start||!aForm.end)return;
    setAbsences(prev=>[...prev,{...aForm,id:Date.now()}].sort((a,b)=>a.start.localeCompare(b.start)));
    setAForm({start:"",end:"",destination:""});setShowAF(false);notify("Absence enregistrée");
    setTimeout(()=>syncNow(),100);
  };

  // ── AI ──────────────────────────────────────────────────────────────────────
  const runAI=async()=>{
    if(!weather){notify("Météo requise");return;}
    setAiLoading(true);setAiText(null);
    const pSum=parcelles.map(p=>{
      const cu=cuStats(p.id);const last=lastTreat(p.id);const ds=daysSince(p.id);
      const latestObs=observations.filter(o=>String(o.parcelleId)===String(p.id))[0];
      return `• ${p.name} (${p.superficie}ha, ${(p.cepages||[]).join("/")||"ND"}): Cu ${cu.total.toFixed(3)}/${cu.limit.toFixed(1)}kg, J+${ds??"-"}, stade: ${latestObs?.stage||"inconnu"}`;
    }).join("\n")||"Aucune parcelle.";
    const absInfo=currentAbsence?`En déplacement jusqu\'au ${currentAbsence.end}`:nextAbsence?`Prochain départ: ${nextAbsence.start}→${nextAbsence.end} (${nextAbsence.destination})`:"Aucune absence";
    const langInstr=lang==="fr"?"Réponds en français":lang==="it"?"Rispondi in italiano":"Answer in English";
    const prompt=`Tu es agronome expert en viticulture biologique sur l\'Etna (Sicile), versant nord-est, altitude ~700m, sols basaltiques. ${langInstr}.

LA RIPRESA — DONNÉES TEMPS RÉEL:
Météo: T=${weather.temp}°C·HR=${weather.rh}%·Pluies3j=${weather.rain3d}mm·Vent=${weather.wind}km/h·Pt rosée=${weather.dewpoint}°C
Risques: Péronospora ${((baseRisks?.peronospora||0)*100).toFixed(0)}%·Oïdium ${((baseRisks?.mildew||0)*100).toFixed(0)}%·Botrytis ${((baseRisks?.botrytis||0)*100).toFixed(0)}%
Agenda: ${absInfo}
Produits: ${products.map(p=>`${p.name}(${p.cu*1000}gCu/${p.unit})`).join(", ")}
Parcelles:\n${pSum}

Analyse 4 points numérotés (max 220 mots):
1. Stade phénologique probable & risque dominant
2. Stratégie traitement: produit, dose, délai, priorité parcelles
3. Impact absence sur risque — action avant départ
4. Budget cuivre: parcelle contrainte & stratégie saison`;
    try{
      const body={model:"claude-sonnet-4-5",max_tokens:750,messages:[{role:"user",content:prompt}]};
      let d;
      if(isDeployed()){d=await api("/api/analyze",{method:"POST",body});}
      else{
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(!res.ok){const e=await res.json().catch(()=>({error:{message:"HTTP "+res.status}}));throw new Error(e.error?.message||`HTTP ${res.status}`);}
        d=await res.json();
      }
      setAiText(d.content?.find(b=>b.type==="text")?.text||"Réponse vide.");
    }catch(e){setAiText("Erreur: "+e.message);}
    setAiLoading(false);
  };

  const handleSendCode=async()=>{
    if(!loginEmail||!/^[^@]+@[^@]+\.[^@]+$/.test(loginEmail)){setLoginError("Email invalide");return;}
    setLoginLoading(true);setLoginError("");
    try{const d=await apiAuth({action:"send_code",email:loginEmail.trim()});setDevCode(d.code||"");setLoginMode(d.mode||"email");setLoginStep("code");}
    catch(e){setLoginError(e.message);}setLoginLoading(false);
  };
  const handleVerifyCode=async()=>{
    setLoginLoading(true);setLoginError("");
    try{
      const d=await apiAuth({action:"verify_code",email:loginEmail.trim(),code:loginCode});
      const sess={token:d.token,email:d.email,name:d.name,picture:null};
      // Les données présentes sur l'appareil appartiennent à un compte : on ne les mélange jamais avec celles d'un autre
      const owner=loadStore().owner;
      if(owner&&owner!==d.email){
        if(!window.confirm(`Cet appareil contient les données de ${owner}.\nLes retirer de cet appareil et ouvrir le compte ${d.email} ?`)){setLoginLoading(false);return;}
        localStorage.removeItem(K);setSession(sess);window.location.reload();return;
      }
      setSession(sess);setLoginView(false);notify("✓ Connecté");
    }catch(e){setLoginError(e.message);}setLoginLoading(false);
  };
  const handleSignOut=async()=>{
    if(sync.hasPending()&&!(await sync.syncNow())&&!window.confirm("Des modifications ne sont pas encore envoyées au cloud. Se déconnecter quand même ?"))return;
    api("/api/auth",{method:"POST",body:{action:"signout"}}).catch(()=>{});
    setSession(null);setLoginView(true);setLoginStep("email");setLoginCode("");notify("Déconnecté");
  };

  // Immediate cloud sync helper — call after any validated action
  const syncNow=()=>sync.flush();

  // ── Send weekly email (opens mailto with PDF link note) ─────────────────────
  const sendWeeklyEmail=()=>{
    if(!user.email){notify("Email requis dans le profil");return;}
    exportWeeklyPDF(parcelles,treatments,observations,weather,baseRisks,forecast,lang);
    const sub=encodeURIComponent(`La Ripresa — Bilan Hebdomadaire ${new Date().toLocaleDateString("fr-FR")}`);
    const body=encodeURIComponent(`Bonjour,

Veuillez trouver ci-joint le rapport hebdomadaire La Ripresa.

Cordialement`);
    window.open(`mailto:${user.email}?subject=${sub}&body=${body}`);
  };

  // Check if in weekly report period (May 1 – Jul 15)
  const inReportPeriod=()=>{const m=new Date().getMonth(),d=new Date().getDate();return(m===4)||(m===5)||(m===6&&d<=15);};

  // ── Render ──────────────────────────────────────────────────────────────────
  const TABS=[
    {k:"home",i:"◆",l:T("home")},
    {k:"risk",i:"◈",l:T("risks")},
    {k:"meteo",i:"◇",l:T("weather")},
    {k:"treats",i:"◉",l:T("treatments")},
    {k:"works",i:"◐",l:T("works")},
    {k:"buy",i:"▤",l:T("purchases")},
    {k:"parcels",i:"▣",l:T("parcels")},
    {k:"agenda",i:"◌",l:T("agenda")},
    {k:"ai",i:"◎",l:T("analysis")},
    {k:"profile",i:"○",l:T("profile")},
  ];

  const isVercel_=isDeployed();
  if(loginView&&isVercel_)return(
    <div style={{background:PARCH,minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"DM Sans,sans-serif",padding:24,boxSizing:"border-box"}}>
      <div style={{width:"100%",maxWidth:400,borderRadius:6,overflow:"hidden",marginBottom:28,position:"relative",height:140}}>
        <img src={IMG_VINE} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 60%"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(28,26,23,.1),rgba(28,26,23,.72))",display:"flex",alignItems:"flex-end",padding:"14px 18px"}}>
          <img src={IMG_LOGO} style={{height:26,filter:"brightness(0) invert(1)"}}/>
        </div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:PARCH2,borderRadius:6,border:`1px solid ${STONE}`,padding:24}}>
        <div style={{fontSize:9,color:MID,letterSpacing:2,textTransform:"uppercase",marginBottom:18,textAlign:"center"}}>CONNEXION</div>
        {loginStep==="email"&&(<div>
          <div style={{fontSize:9,color:MID,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Email</div>
          <input value={loginEmail} onChange={e=>{setLoginEmail(e.target.value);setLoginError("");}}
            onKeyDown={e=>e.key==="Enter"&&handleSendCode()}
            style={{width:"100%",background:PARCH,border:`1px solid #D8D0C0`,color:INK,borderRadius:4,padding:"11px 12px",fontSize:16,boxSizing:"border-box",fontFamily:"DM Sans,sans-serif",marginBottom:12}}
            placeholder="votre@email.com" type="email" autoCapitalize="none"/>
          {loginError&&<div style={{color:"#B83232",fontSize:11,marginBottom:10}}>{loginError}</div>}
          <button onClick={handleSendCode} disabled={loginLoading}
            style={{...css.pri,opacity:loginLoading?.6:1,marginBottom:0}}>
            {loginLoading?"Envoi en cours…":"Recevoir un code par email"}
          </button>
        </div>)}
        {loginStep==="code"&&(<div>
          <div style={{fontSize:12,color:MID,marginBottom:4}}>{loginMode==="pin"?"Saisissez votre code personnel pour ":loginMode==="open"?"Code de connexion pour ":"Code envoyé à "}<strong style={{color:INK}}>{loginEmail}</strong></div>
          {devCode&&<div style={{padding:"8px 10px",background:"rgba(42,191,170,.1)",border:`1px solid ${TEAL}`,borderRadius:4,marginBottom:10,fontSize:13,color:TEAL_D,textAlign:"center",fontWeight:700,letterSpacing:4}}>{devCode}</div>}
          <div style={{fontSize:9,color:MID,letterSpacing:1,textTransform:"uppercase",marginBottom:4,marginTop:10}}>Code à 6 chiffres</div>
          <input value={loginCode} onChange={e=>{setLoginCode(e.target.value.replace(/\D/g,"").slice(0,6));setLoginError("");}}
            onKeyDown={e=>e.key==="Enter"&&loginCode.length===6&&handleVerifyCode()}
            style={{width:"100%",background:PARCH,border:`1px solid #D8D0C0`,color:INK,borderRadius:4,padding:"11px 12px",fontSize:28,boxSizing:"border-box",fontFamily:"DM Serif Display,serif",marginBottom:12,letterSpacing:10,textAlign:"center"}}
            placeholder="000000" inputMode="numeric"/>
          {loginError&&<div style={{color:"#B83232",fontSize:11,marginBottom:10}}>{loginError}</div>}
          <button onClick={handleVerifyCode} disabled={loginLoading||loginCode.length!==6}
            style={{...css.pri,opacity:(loginLoading||loginCode.length!==6)?.6:1,marginBottom:8}}>
            {loginLoading?"Vérification…":"Se connecter"}
          </button>
          <button onClick={()=>{setLoginStep("email");setLoginCode("");setLoginError("");setDevCode("");}}
            style={{...css.sec,width:"100%"}}>← Changer d'email</button>
        </div>)}
      </div>
      <div style={{fontSize:10,color:MID,marginTop:16,textAlign:"center",lineHeight:1.8}}>
        🔐 Données rattachées à votre compte · accès multi-appareils<br/>
        <span style={{fontSize:9,color:"#C0A882"}}>La Ripresa · Etna DOC · Vignoble Biologique</span>
      </div>
    </div>
  );

  return(
    <div style={css.root}>
      {toast&&<div style={css.toast}>{toast}</div>}

      {/* HERO */}
      <div style={css.hero}>
        <img src={IMG_VINE} alt="" style={css.heroImg}/>
        <div style={css.heroGrad}/>
        <button onClick={()=>setTab("profile")} style={{position:"absolute",top:"calc(10px + env(safe-area-inset-top))",right:12,display:"flex",alignItems:"center",gap:5,background:"rgba(28,26,23,.45)",border:"none",borderRadius:10,padding:"4px 9px",cursor:"pointer"}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:syncColor(sync.status)}}/>
          <span style={{fontSize:8,letterSpacing:1,color:"rgba(244,240,232,.85)",textTransform:"uppercase",fontFamily:"DM Sans,sans-serif"}}>{syncLabel(T,sync.status)}</span>
        </button>
        <div style={css.heroBox}>
          <img src={IMG_LOGO} alt="La Ripresa" style={css.logoImg}/>
          <div style={css.heroSub}>{T("app_sub")}</div>
          {currentAbsence&&<div style={css.absencePill}>✈ En déplacement · retour {new Date(currentAbsence.end).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>}
        </div>
      </div>

      {/* TABS — scrollable */}
      <div style={css.tabs}>
        {TABS.map(({k,i,l})=>(
          <button key={k} onClick={()=>setTab(k)} style={{...css.tab,...(tab===k?css.tabOn:{})}}>
            <span style={{fontSize:10,opacity:.65}}>{i}</span>
            <span style={css.tabL}>{l}</span>
          </button>
        ))}
      </div>

      <div style={css.body}>

        {/* ════ HOME ════ */}
        {tab==="home"&&(<Col>
          {wLoading&&<Info>Chargement météo…</Info>}
          {wError&&<Info warn>{wError} <TxtBtn onClick={fetchWeather}>↺</TxtBtn></Info>}
          {(()=>{
            const now=new Date(),due=tasksDue(tasks,now.getFullYear(),now.getMonth()+1),low=lowStock(products,invoices,treatments,stockCounts);
            const late=projects.filter(p=>p.status==="active"&&(p.steps||[]).some(st=>!st.done&&st.due&&st.due<=today));
            if(!due.length&&!low.length&&!late.length)return null;
            return(<Box title={T("to_watch")}>
              {due.length>0&&<button onClick={()=>setTab("works")} style={{...css.recRow,width:"100%",background:"none",borderColor:STONE,cursor:"pointer",textAlign:"left"}}>
                <span style={{...css.dot,background:TEAL}}/><span style={{fontSize:11,color:INK,flex:1}}>{T("this_month")} : {due.slice(0,3).map(x=>x.label).join(" · ")}{due.length>3?` +${due.length-3}`:""}</span></button>}
              {late.map(p=>(<button key={p.id} onClick={()=>setTab("works")} style={{...css.recRow,width:"100%",background:"none",borderColor:STONE,cursor:"pointer",textAlign:"left"}}>
                <span style={{...css.dot,background:"#C07828"}}/><span style={{fontSize:11,color:INK,flex:1}}>{p.name} — {T("step_due")}</span></button>))}
              {low.map(({p,s:st})=>(<button key={p.id} onClick={()=>setTab("buy")} style={{...css.recRow,width:"100%",background:"none",borderColor:"rgba(184,50,50,.3)",cursor:"pointer",textAlign:"left"}}>
                <span style={{...css.dot,background:"#B83232"}}/><span style={{fontSize:11,color:"#B83232",flex:1}}>{T("stock_low")} : {p.name} ({st.qty} {p.unit})</span></button>))}
            </Box>);
          })()}

          {/* Absence banner */}
          {(currentAbsence||nextAbsence)&&(
            <div style={{...css.absCard,borderColor:currentAbsence?"#B83232":TEAL}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,fontWeight:500,color:currentAbsence?"#B83232":TEAL}}>
                  {currentAbsence?"✈ ABSENT EN CE MOMENT":"✈ "+(nextAbsence.destination||"Déplacement prévu")}
                </span>
                <span style={{fontSize:10,color:MID}}>
                  {currentAbsence?`retour ${new Date(currentAbsence.end).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`
                    :`${new Date(nextAbsence.start).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} → ${new Date(nextAbsence.end).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`}
                </span>
              </div>
              {nextAbsence&&parcelles.map(p=>{
                const atEnd=riskAtReturn(p.id,nextAbsence);
                const max=atEnd?Math.max(atEnd.peronospora,atEnd.mildew,atEnd.botrytis):0;
                if(max<.50)return null;
                const v=lv(max);
                return(<div key={p.id} style={{marginTop:5,fontSize:10,color:v.c,paddingTop:4,borderTop:`1px solid ${STONE}`}}>
                  ⚠ {p.name} — risque {v.label.toLowerCase()} au retour
                </div>);
              })}
            </div>
          )}

          {/* Risk chips */}
          {baseRisks&&(<div style={css.chipRow}>
            {[["Péronospora","peronospora"],["Oïdium","mildew"],["Botrytis","botrytis"]].map(([label,k])=>{const score=parcelles.length>0?Math.max(...parcelles.map(p=>parcelRisk(p.id)?.[k]||0)):baseRisks[k];
              const v=lv(score);
              return(<div key={label} style={{...css.chip,borderTop:`2px solid ${v.c}`,background:v.bg}}>
                <div style={{fontSize:7,color:MID,letterSpacing:.8,textTransform:"uppercase",marginBottom:2}}>{label}</div>
                <div style={{fontSize:22,fontWeight:300,color:v.c,lineHeight:1,fontFamily:"DM Serif Display,serif"}}>{(score*100).toFixed(0)}<span style={{fontSize:10}}>%</span></div>
                <div style={{fontSize:7,color:v.c,letterSpacing:.8,marginTop:2}}>{v.label}</div>
              </div>);
            })}
          </div>)}

          {/* Weather */}
          {weather&&(<Box title={T("current_conditions")}>
            <div style={css.wGrid}>
              <Stat v={`${weather.temp}°C`} l={T("temperature")}/>
              <Stat v={`${weather.rh}%`} l={T("humidity")}/>
              <Stat v={`${weather.rain3d}mm`} l={T("rain_3d")}/>
              <Stat v={`${weather.wind}km/h`} l={T("wind")}/>
            </div>
            {weather.desc&&<div style={{textAlign:"center",color:MID,fontSize:11,marginTop:8,fontStyle:"italic"}}>{weather.desc}</div>}
          </Box>)}

          {/* Per-parcelle cards */}
          {parcelles.filter(p=>!p.parentId).length===0
            ?<Info>{T("no_parcels")}</Info>
            :parcelles.filter(p=>!p.parentId).map(p=>{
              const ts=treatments.filter(t=>String(t.parcelleId)===String(p.id)).sort((a,b)=>b.date.localeCompare(a.date));
              const last=ts[0],prev=ts.slice(1);
              const recs=getRecs(p.id);
              const cu=cuStats(p.id);
              const ds=daysSince(p.id);
              const dl=daysLeft(p.id);
              const isOpen=expandedP===p.id;
              const subParcels=parcelles.filter(sp=>String(sp.parentId)===String(p.id));
              const latestObs=observations.filter(o=>String(o.parcelleId)===String(p.id))[0];
              return(<Box key={p.id} title={p.name} sub={`${p.superficie}ha · ${(p.cepages||[]).slice(0,2).join(", ")||"—"}`}
                action={<TxtBtn onClick={()=>startEditParcel(p)}>{T("edit")}</TxtBtn>}>

                {/* Phenology badge */}
                {latestObs?.stage&&(
                  <div style={{display:"inline-block",fontSize:9,color:TEAL_D,border:`1px solid ${TEAL}`,borderRadius:2,padding:"1px 6px",marginBottom:6,letterSpacing:.5}}>{latestObs.stage}</div>
                )}

                {/* Sub-parcels */}
                {subParcels.length>0&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                    {subParcels.map(sp=><span key={sp.id} style={{fontSize:8,color:MID,background:STONE,borderRadius:2,padding:"2px 6px"}}>{sp.name}</span>)}
                  </div>
                )}

                {/* Protection bars — Cu (péronospora) and S (mildew) */}
                {(()=>{
                  const dcu=daysSinceCu(p.id), ds_s=daysSinceS(p.id);
                  if(dcu===null&&ds_s===null)return null;
                  const pCu=dcu!==null?Math.max(0,(1-dcu/14)*100):0;
                  const pS=ds_s!==null?Math.max(0,(1-ds_s/14)*100):0;
                  return(
                    <div style={{marginBottom:8,padding:"7px 10px",background:"rgba(244,240,232,.6)",borderRadius:4,border:`1px solid ${STONE}`}}>
                      {dcu!==null&&(
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontSize:8,color:MID,width:58,flexShrink:0}}>Cu J+{dcu}</span>
                          <div style={{flex:1,height:3,background:STONE,borderRadius:2}}>
                            <div style={{width:`${pCu}%`,height:"100%",borderRadius:2,background:pCu>50?"#4A8A6A":pCu>20?"#A08010":"#B83232"}}/>
                          </div>
                          <span style={{fontSize:8,color:pCu>50?TEAL_D:pCu>20?"#A08010":"#B83232",width:32,textAlign:"right"}}>{pCu.toFixed(0)}%</span>
                        </div>
                      )}
                      {ds_s!==null&&(
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:8,color:MID,width:58,flexShrink:0}}>S J+{ds_s}</span>
                          <div style={{flex:1,height:3,background:STONE,borderRadius:2}}>
                            <div style={{width:`${pS}%`,height:"100%",borderRadius:2,background:pS>50?"#8A7A20":pS>20?"#A08010":"#B83232"}}/>
                          </div>
                          <span style={{fontSize:8,color:pS>50?"#8A7A20":pS>20?"#A08010":"#B83232",width:32,textAlign:"right"}}>{pS.toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Absence risk */}
                {nextAbsence&&(()=>{
                  const atEnd=riskAtReturn(p.id,nextAbsence);
                  const max=atEnd?Math.max(atEnd.peronospora,atEnd.mildew,atEnd.botrytis):0;
                  if(max<.35)return null;
                  const v=lv(max);
                  return(<div style={{...css.recRow,borderColor:"#C07828"+"55",marginBottom:6,background:"rgba(192,120,40,.06)"}}>
                    <span style={{fontSize:9,color:"#C07828"}}>✈ Risque {v.label.toLowerCase()} au retour — {T("treat_before")}</span>
                  </div>);
                })()}

                {/* Recs */}
                {recs.map((r,i)=>{
                  const v=lv(r.score);
                  return(<div key={i} style={{...css.recRow,borderColor:v.c+"55"}}>
                    <span style={{...css.dot,background:v.c}}/>
                    {r.urgent&&<span style={{...css.urgTag,color:v.c,borderColor:v.c}}>{T("urgent")}</span>}
                    <span style={{fontSize:11,color:v.c,fontWeight:500}}>{r.d}</span>
                    <span style={{fontSize:10,color:MID,marginLeft:4}}>→ {getProduct(r.pid)?.name}</span>
                    {r.days>10&&<span style={{fontSize:9,color:MID,marginLeft:"auto"}}>J+{r.days}</span>}
                  </div>);
                })}

                {/* Last treatment */}
                {last?(<div style={css.lastBox}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontSize:13,color:WARM,fontFamily:"DM Serif Display,serif"}}>{last.productName||last.product}</span>
                    <span style={{fontSize:10,color:MID}}>{new Date(last.date).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div style={{fontSize:11,color:MID,marginTop:2}}>{last.disease} · {last.dose} {last.unit||""}/ha · {last.superficie}ha</div>
                  <div style={{fontSize:10,color:WARM,marginTop:3}}>
                    {last.cu_applied>0&&`Cu: ${last.cu_applied.toFixed(3)}kg`}
                    {last.s_applied>0&&` · S: ${last.s_applied.toFixed(3)}kg`}
                    <span style={{color:MID,marginLeft:6}}>{T("cu_balance")}: {cu.rem.toFixed(2)}kg</span>
                  </div>
                  {last.notes&&<div style={{fontSize:10,color:MID,fontStyle:"italic",marginTop:2}}>{last.notes}</div>}
                </div>):<div style={{fontSize:11,color:"#C0A882",fontStyle:"italic",padding:"4px 0"}}>{T("no_treatment")}</div>}

                {/* Previous treatments collapsible */}
                {prev.length>0&&(<div style={{marginTop:6}}>
                  <button onClick={()=>setExpandedP(isOpen?null:p.id)} style={css.toggleBtn}>
                    {isOpen?"▲":"▼"} {prev.length} traitement{prev.length>1?"s":""} précédent{prev.length>1?"s":""}
                  </button>
                  {isOpen&&prev.map(t=>(
                    <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderTop:`1px solid ${STONE}`,fontSize:10,color:MID}}>
                      <span>{new Date(t.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"2-digit"})}</span>
                      <span style={{color:WARM}}>{t.productName||t.product}</span>
                      <span>{t.disease}</span>
                    </div>
                  ))}
                </div>)}

                {/* Cu bar */}
                <div style={{marginTop:8}}>
                  <div style={css.track}><div style={{...css.bar,width:`${cu.pct}%`,background:cu.pct>80?"#B83232":cu.pct>60?"#C07828":TEAL}}/></div>
                  <div style={{fontSize:9,color:MID,marginTop:2}}>Cu {cu.total.toFixed(2)}/{cu.limit.toFixed(1)}kg · {cu.pct.toFixed(0)}%</div>
                </div>
              </Box>);
            })
          }
          <div style={{borderRadius:4,overflow:"hidden",border:`1px solid ${STONE}`}}>
            <img src={IMG_BOTT} alt="" style={{width:"100%",display:"block"}}/>
            <div style={{background:INK,textAlign:"center",padding:"8px 0",fontSize:8,color:"rgba(244,240,232,.45)",letterSpacing:4}}>SORGE · TARTARI · GRENACHE</div>
          </div>
        </Col>)}

        {/* ════ RISQUES ════ */}
        {tab==="risk"&&(<Col>
          {[
            {label:"Péronospora",k:"peronospora",note:"Plasmopara viticola · Modèle EPI",detail:"T>11°C + 10mm/48h + HR>85% · Optimum 20–25°C"},
            {label:"Oïdium",k:"mildew",note:"Uncinula necator · Modèle Gut-Reuveni",detail:"T 17–28°C · HR≥40% · Favorisé par temps sec chaud"},
            {label:"Botrytis",k:"botrytis",note:"Botrytis cinerea",detail:"T 15–25°C · HR>90% · Blessures & fermeture grappes"},
          ].map(({label,k,note,detail})=>{
            const base=baseRisks?.[k]||0;
              const adjMax=parcelles.length>0?Math.max(...parcelles.map(p=>parcelRisk(p.id)?.[k]||0)):base;
              const v=lv(adjMax);
              const thr=[.1,.3,.5,.75,1],tc=["#9A9090","#2E7D52","#A08010","#C07828","#B83232"],tl=["Nul","Faible","Modéré","Élevé","Critique"];
              return(<Box key={label} title={label} sub={note}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,margin:"4px 0 6px"}}>
                  <span style={{fontSize:40,fontWeight:300,color:v.c,fontFamily:"DM Serif Display,serif",lineHeight:1}}>{(adjMax*100).toFixed(0)}</span>
                  <span style={{fontSize:11,color:v.c,letterSpacing:1}}>% · {v.label}</span>
                </div>
                {parcelles.length>0&&(adjMax<base-0.05)&&(
                  <div style={{fontSize:10,color:MID,marginBottom:6,fontStyle:"italic"}}>
                    Risque météo brut : {(base*100).toFixed(0)}% · réduit par protection active
                  </div>
                )}
                <div style={css.track}><div style={{...css.bar,width:`${adjMax*100}%`,background:v.c}}/></div>
              <div style={{display:"flex",gap:3,margin:"6px 0 8px"}}>
                {thr.map((t,i)=>{const prev=[0,.1,.3,.5,.75];const act=base>prev[i]&&base<=t;return(
                  <div key={i} style={{flex:1}}><div style={{height:3,borderRadius:1,background:tc[i],opacity:act?1:.18}}/><div style={{fontSize:7,color:tc[i],marginTop:2,textAlign:"center",opacity:act?1:.4}}>{tl[i]}</div></div>
                );})}
              </div>
              <div style={{fontSize:10,color:MID,marginBottom:10}}>{detail}</div>
              {parcelles.map(p=>{
                const pr=parcelRisk(p.id);const ds=daysSince(p.id);
                const score=pr?.[k]||0;const pv=lv(score);
                return(<div key={p.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{fontSize:9,color:MID,width:110,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  <div style={{flex:1,height:3,background:STONE,borderRadius:1}}><div style={{width:`${score*100}%`,height:"100%",background:pv.c,borderRadius:1}}/></div>
                  <span style={{fontSize:9,color:pv.c,width:30,textAlign:"right"}}>{(score*100).toFixed(0)}%</span>
                  {ds!==null&&<span style={{fontSize:8,color:MID}}>J+{ds}</span>}
                </div>);
              })}
            </Box>);
          })}
        </Col>)}

        {/* ════ MÉTÉO ════ */}
        {tab==="meteo"&&(<Col>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={css.sLabel}>Open-Meteo · Etna</span>
            <TxtBtn onClick={fetchWeather}>{wLoading?"…":"↺"} Actualiser</TxtBtn>
          </div>
          {wError&&<Info warn>{wError}</Info>}
          {weather&&(<Box title={T("current_conditions")}>
            <div style={css.wGrid}>
              <Stat v={`${weather.temp}°C`} l={T("temperature")}/>
              <Stat v={`${weather.rh}%`} l={T("humidity")}/>
              <Stat v={`${weather.rain3d}mm`} l={T("rain_3d")}/>
              <Stat v={`${weather.wind}km/h`} l={T("wind")}/>
            </div>
            {weather.desc&&<div style={{textAlign:"center",color:MID,fontSize:11,marginTop:8,fontStyle:"italic"}}>{weather.desc}</div>}
          </Box>)}
          {forecast.length>0&&(<Box title={T("10day_forecast")}>
            {forecast.map((d,i)=>{
              const fw={temp:(d.tmax+d.tmin)/2,rh:d.rh,rain3d:d.rain*1.5,dewpoint:(d.tmax+d.tmin)/2-5,wind:0};
              const r=computeRisk(fw);const max=r?Math.max(r.peronospora,r.mildew,r.botrytis):0;
              const v=lv(max);
              const lbl=i===0?T("today"):i===1?T("tomorrow"):new Date(d.date).toLocaleDateString(lang==="fr"?"fr-FR":lang==="it"?"it-IT":"en-GB",{weekday:"short",day:"numeric"});
              const onAbs=absences.some(a=>d.date>=a.start&&d.date<=a.end);
              return(<div key={d.date} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:`1px solid ${STONE}`,background:onAbs?"rgba(42,191,170,.04)":"transparent"}}>
                <span style={{width:84,fontSize:11,color:onAbs?TEAL:MID,flexShrink:0}}>{onAbs?"✈ ":""}{lbl}</span>
                <span style={{fontSize:11,color:INK,width:68,flexShrink:0,fontFamily:"DM Serif Display,serif"}}>{d.tmin}°/{d.tmax}°C</span>
                <span style={{fontSize:11,width:46,flexShrink:0,color:d.rain>5?"#4A6E8A":MID}}>{d.rain>.5?`${d.rain}mm`:"—"}</span>
                <span style={{fontSize:8,padding:"2px 5px",borderRadius:2,background:v.bg,color:v.c,letterSpacing:.4,flexShrink:0}}>{v.label}</span>
              </div>);
            })}
          </Box>)}
          <Station T={T} lang={lang} parcelles={parcelles} stations={stations} setStations={setStations} views={stationViews} reload={loadStations} weather={weather} notify={notify}/>
        </Col>)}

        {/* ════ TRAITEMENTS ════ */}
        {tab==="treats"&&(<Col>
          <SeasonPick value={season} onChange={setSeason} years={yearsOf(treatments,works,invoices)} label={T("season")}/>
          <div style={{display:"flex",gap:8}}>
            <PriBtn onClick={()=>setShowTF(p=>!p)}>{T("add_treatment")}</PriBtn>
            <SecBtn onClick={()=>exportAllTreatmentsPDF(parcelles,treatments,season)}>{T("export_pdf")}</SecBtn>
          </div>

          {showTF&&(<Box title="Nouveau traitement"><Col>
            <F label="Parcelle">
              <select value={tForm.parcelleId} onChange={e=>setTForm(p=>({...p,parcelleId:e.target.value}))} style={css.inp}>
                <option value="">Sélectionner…</option>
                {parcelles.map(p=><option key={p.id} value={p.id}>{p.parentId?"  └ ":""}{p.name} ({p.superficie}ha)</option>)}
              </select>
            </F>
            <F label="Date"><input type="date" value={tForm.date} onChange={e=>setTForm(p=>({...p,date:e.target.value}))} style={css.dateInp}/></F>
            <F label="Maladie">
              <select value={tForm.disease} onChange={e=>setTForm(p=>({...p,disease:e.target.value}))} style={css.inp}>
                <option>Péronospora</option><option>Oïdium</option><option>Botrytis</option><option>Préventif mixte</option>
              </select>
            </F>
            <F label="Produit">
              <select value={tForm.productId} onChange={e=>setTForm(p=>({...p,productId:e.target.value}))} style={css.inp}>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.cu>0?`${p.cu*1000}g Cu/${p.unit}`:`${p.s*1000}g S/${p.unit}`})</option>)}
              </select>
            </F>
            <F label={`Dose (${getProduct(tForm.productId)?.unit||"L"}/ha)`}>
              <input type="number" step="0.1" min="0" value={tForm.dose} onChange={e=>setTForm(p=>({...p,dose:e.target.value}))} style={css.inp} placeholder="ex: 2.5"/>
            </F>
            {tForm.dose&&tForm.parcelleId&&(()=>{
              const prod=getProduct(tForm.productId);
              const surf=parcelles.find(p=>String(p.id)===String(tForm.parcelleId))?.superficie||1;
              const d=parseFloat(tForm.dose)||0;
              return(<div style={css.calcBox}>
                <div style={{fontSize:9,color:MID,letterSpacing:.8,marginBottom:4}}>BILAN ESTIMÉ · {surf}ha</div>
                {prod.cu>0&&<div style={{fontSize:12,color:WARM}}>Cuivre : <strong>{(d*prod.cu*surf).toFixed(3)}kg</strong></div>}
                {prod.s>0&&<div style={{fontSize:12,color:"#7A6810"}}>Soufre : <strong>{(d*prod.s*surf).toFixed(3)}kg</strong></div>}
                {(()=>{const st=stockOf(prod,invoices,treatments,stockCounts);if(!st.tracked)return null;const left=st.qty-d*surf;
                  return <div style={{fontSize:11,color:left<0?"#B83232":MID,marginTop:3}}>{T("stock")} : {st.qty} {prod.unit} → <strong>{(Math.round(left*1000)/1000)} {prod.unit}</strong></div>;})()}
              </div>);
            })()}
            <F label="Notes"><input type="text" value={tForm.notes} onChange={e=>setTForm(p=>({...p,notes:e.target.value}))} style={css.inp} placeholder="Observations…"/></F>
            <PriBtn onClick={addTreatment}>Enregistrer</PriBtn>
          </Col></Box>)}

          {/* Products list */}
          <Box title={T("products")} action={<TxtBtn onClick={()=>setShowProdF(p=>!p)}>{T("add_product")}</TxtBtn>}>
            {showProdF&&(<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${STONE}`}}><Col>
              <F label="Nom produit"><input value={prodForm.name} onChange={e=>setProdForm(p=>({...p,name:e.target.value}))} style={css.inp} placeholder="Ex: Kupfer-Max"/></F>
              <div style={{display:"flex",gap:8}}>
                <F label="Unité"><select value={prodForm.unit} onChange={e=>setProdForm(p=>({...p,unit:e.target.value}))} style={css.inp}><option>L</option><option>kg</option></select></F>
                <F label="Cu (g/unité)"><input type="number" value={prodForm.cu_per_L} onChange={e=>setProdForm(p=>({...p,cu_per_L:e.target.value}))} style={css.inp} placeholder="ex: 400"/></F>
                <F label="S (g/unité)"><input type="number" value={prodForm.s_per_unit} onChange={e=>setProdForm(p=>({...p,s_per_unit:e.target.value}))} style={css.inp} placeholder="ex: 900"/></F>
              </div>
              <PriBtn onClick={addProduct}>Ajouter le produit</PriBtn>
            </Col></div>)}
            {products.map(p=>(
              <div key={p.id} style={{padding:"8px 0",borderBottom:`1px solid ${STONE}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,color:INK,fontFamily:"DM Serif Display,serif"}}>{p.name}</div>
                  <div style={{fontSize:9,color:MID}}>/{p.unit} · {p.cu>0?`${(p.cu*1000).toFixed(0)}g Cu`:`${(p.s*1000).toFixed(0)}g S`}</div>
                </div>
                {p.editable&&<button onClick={()=>{if(window.confirm(`${T("confirm_delete")} (${p.name})`))setProducts(prev=>prev.filter(x=>x.id!==p.id));}} style={css.del}>{T("delete")}</button>}
              </div>
            ))}
          </Box>

          {/* History by parcelle — collapsible rows */}
          {parcelles.map(p=>{
            const ts=treatments.filter(t=>String(t.parcelleId)===String(p.id)&&String(t.date).startsWith(String(season))).sort((a,b)=>b.date.localeCompare(a.date));
            const cu=cuStats(p.id,season);
            if(!ts.length)return null;
            return(<Box key={p.id} title={p.name} sub={`Cu ${cu.total.toFixed(3)}/${cu.limit.toFixed(1)}kg (${cu.pct.toFixed(0)}%)`}
              action={<TxtBtn onClick={()=>exportParcelPDF(p,treatments,observations,lang)}>PDF</TxtBtn>}>
              <div style={css.track}><div style={{...css.bar,width:`${cu.pct}%`,background:cu.pct>80?"#B83232":TEAL}}/></div>
              <div style={{height:8}}/>
              {ts.map(t=>{
                const isExp=expandedT===t.id;
                return(<div key={t.id} style={{borderBottom:`1px solid ${STONE}`}}>
                  <button onClick={()=>setExpandedT(isExp?null:t.id)} style={{width:"100%",background:"none",border:"none",padding:"9px 0",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                      <span style={{fontSize:12,fontFamily:"DM Serif Display,serif",color:INK}}>{new Date(t.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"2-digit"})}</span>
                      <span style={{fontSize:11,color:WARM}}>{t.productName||t.product}</span>
                      <span style={{fontSize:9,color:MID}}>{isExp?"▲":"▼"}</span>
                    </div>
                    <div style={{fontSize:10,color:MID,marginTop:2}}>{t.disease}</div>
                  </button>
                  {isExp&&(<div style={{padding:"6px 0 10px",borderTop:`1px solid ${STONE}`}}>
                    <div style={{fontSize:11,color:MID}}>{t.dose} {t.unit||""}/ha · {t.superficie}ha</div>
                    <div style={{fontSize:10,marginTop:3}}>
                      {t.cu_applied>0&&<span style={{color:WARM}}>Cu {t.cu_applied.toFixed(3)}kg </span>}
                      {t.s_applied>0&&<span style={{color:"#8A7A20"}}>S {t.s_applied.toFixed(3)}kg</span>}
                    </div>
                    {t.notes&&<div style={{fontSize:10,color:MID,fontStyle:"italic",marginTop:3}}>{t.notes}</div>}
                    <button onClick={()=>setTreatments(prev=>prev.filter(x=>x.id!==t.id))} style={{...css.del,marginTop:6}}>{T("delete")}</button>
                  </div>)}
                </div>);
              })}
            </Box>);
          })}
          {parcelles.length>0&&!treatments.some(t=>String(t.date).startsWith(String(season)))&&<Info>{T("no_treatment")} — {season}</Info>}
          {!parcelles.length&&<Info>Créez une parcelle avant d'enregistrer un traitement.</Info>}
        </Col>)}

        {/* ════ PARCELLES ════ */}
        {tab==="parcels"&&(<Col>
          <div style={{display:"flex",gap:8}}>
            <PriBtn onClick={()=>{setEditParcel(null);setPForm({name:"",lat:"",lon:"",superficie:"1",cepages:[],parentId:null});setShowPF(p=>!p)}}>{T("new_parcel")}</PriBtn>
          </div>
          {showPF&&(<Box title={editParcel?"Modifier la parcelle":"Créer une parcelle"}><Col>
            {!editParcel&&(<F label="Sous-parcelle de">
              <select value={pForm.parentId||""} onChange={e=>setPForm(p=>({...p,parentId:e.target.value||null}))} style={css.inp}>
                <option value="">— Parcelle principale —</option>
                {parcelles.filter(p=>!p.parentId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </F>)}
            <F label="Nom"><input value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={css.inp} placeholder="Ex: Contrada Solicchiata Nord"/></F>
            <div style={{display:"flex",gap:8}}>
              <F label="Latitude"><input value={pForm.lat} onChange={e=>setPForm(p=>({...p,lat:e.target.value}))} style={css.inp} placeholder="37.8421"/></F>
              <F label="Longitude"><input value={pForm.lon} onChange={e=>setPForm(p=>({...p,lon:e.target.value}))} style={css.inp} placeholder="14.897"/></F>
            </div>
            <F label="Superficie (ha)"><input type="number" step="0.1" min="0.1" value={pForm.superficie} onChange={e=>setPForm(p=>({...p,superficie:e.target.value}))} style={css.inp}/></F>
            <div>
              <div style={css.fieldLabel}>Encépagement</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                {CEPAGES_LIST.map(c=>{const sel=pForm.cepages.includes(c);return(
                  <button key={c} onClick={()=>setPForm(p=>({...p,cepages:sel?p.cepages.filter(x=>x!==c):[...p.cepages,c]}))} style={{...css.cepBtn,...(sel?css.cepOn:{})}}>{c}</button>
                );})}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <PriBtn onClick={addParcelle}>{T("save")}</PriBtn>
              <SecBtn onClick={()=>{setShowPF(false);setEditParcel(null);}}>{T("cancel")}</SecBtn>
            </div>
          </Col></Box>)}

          {parcelles.length===0?<Info>Aucune parcelle. Commencez par en créer une.</Info>
          :parcelles.filter(p=>!p.parentId).map(p=>{
            const cu=cuStats(p.id);
            const ts=treatments.filter(t=>String(t.parcelleId)===String(p.id));
            const subP=parcelles.filter(sp=>String(sp.parentId)===String(p.id));
            const obsP=observations.filter(o=>String(o.parcelleId)===String(p.id)).sort((a,b)=>b.date.localeCompare(a.date));
            return(<Box key={p.id} title={p.name} sub={`${p.superficie}ha · ${p.lat||LAT}°N ${p.lon||LON}°E`}
              action={<div style={{display:"flex",gap:8}}><TxtBtn onClick={()=>startEditParcel(p)}>{T("edit")}</TxtBtn><TxtBtn onClick={()=>exportParcelPDF(p,treatments,observations,lang)}>PDF</TxtBtn></div>}>

              {(p.cepages||[]).length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                  {p.cepages.map(c=><span key={c} style={css.cepTag}>{c}</span>)}
                </div>
              )}

              {/* Sub-parcels */}
              {subP.length>0&&(<div style={{marginBottom:8}}>
                <div style={{fontSize:8,color:MID,letterSpacing:.8,textTransform:"uppercase",marginBottom:4}}>{T("sub_parcels")}</div>
                {subP.map(sp=>(<div key={sp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${STONE}`,fontSize:11}}>
                  <span style={{color:INK}}>{sp.name}</span>
                  <span style={{color:MID}}>{sp.superficie}ha</span>
                  <TxtBtn onClick={()=>startEditParcel(sp)}>{T("edit")}</TxtBtn>
                </div>))}
              </div>)}

              {/* Phenology & observations */}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:8,color:MID,letterSpacing:.8,textTransform:"uppercase"}}>{T("phenology")}</span>
                  <TxtBtn onClick={()=>setShowOF(showOF===p.id?null:p.id)}>{T("add_observation")}</TxtBtn>
                </div>
                {showOF===p.id&&(<div style={{padding:"10px",background:PARCH,borderRadius:4,border:`1px solid ${STONE}`,marginBottom:8}}><Col>
                  <F label="Date"><input type="date" value={oForm.date} onChange={e=>setOForm(x=>({...x,date:e.target.value}))} style={css.dateInp}/></F>
                  <F label={T("phenology")}>
                    <select value={oForm.stage} onChange={e=>setOForm(x=>({...x,stage:e.target.value}))} style={css.inp}>
                      <option value="">—</option>
                      {PHENOLOGY.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </F>
                  <F label="Observation"><input value={oForm.text} onChange={e=>setOForm(x=>({...x,text:e.target.value}))} style={css.inp} placeholder="Notes, observations…"/></F>
                  {/* Maturity fields */}
                  <div style={{fontSize:8,color:TEAL_D,letterSpacing:.8,textTransform:"uppercase",marginTop:4}}>{T("maturity")}</div>
                  <div style={{display:"flex",gap:6}}>
                    <F label="Brix °"><input type="number" step="0.1" value={oForm.brix} onChange={e=>setOForm(x=>({...x,brix:e.target.value}))} style={{...css.inp,width:"100%"}} placeholder="22.5"/></F>
                    <F label="pH"><input type="number" step="0.01" value={oForm.ph} onChange={e=>setOForm(x=>({...x,ph:e.target.value}))} style={{...css.inp,width:"100%"}} placeholder="3.40"/></F>
                    <F label="TA g/L"><input type="number" step="0.1" value={oForm.ta} onChange={e=>setOForm(x=>({...x,ta:e.target.value}))} style={{...css.inp,width:"100%"}} placeholder="5.8"/></F>
                  </div>
                  {/* Harvest */}
                  {oForm.stage==="Récolte"&&(<>
                    <div style={{fontSize:8,color:TEAL_D,letterSpacing:.8,textTransform:"uppercase"}}>{T("harvest")}</div>
                    <F label="Rendement (kg/ha)"><input type="number" value={oForm.weight} onChange={e=>setOForm(x=>({...x,weight:e.target.value}))} style={css.inp} placeholder="4500"/></F>
                  </>)}
                  <div style={{display:"flex",gap:8}}>
                    <PriBtn onClick={()=>addObservation(p.id)}>{T("save")}</PriBtn>
                    <SecBtn onClick={()=>setShowOF(null)}>{T("cancel")}</SecBtn>
                  </div>
                </Col></div>)}

                {obsP.slice(0,3).map(o=>(
                  <div key={o.id} style={{padding:"6px 0",borderBottom:`1px solid ${STONE}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                      <span style={{fontSize:10,color:INK,fontWeight:500}}>{new Date(o.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</span>
                      {o.stage&&<span style={{fontSize:9,color:TEAL_D,border:`1px solid ${TEAL}`,borderRadius:2,padding:"0 4px"}}>{o.stage}</span>}
                    </div>
                    {o.text&&<div style={{fontSize:10,color:MID,marginTop:2}}>{o.text}</div>}
                    {(o.brix||o.ph||o.ta)&&<div style={{fontSize:9,color:TEAL_D,marginTop:2}}>{o.brix?`${o.brix}°Brix`:""}{o.ph?` · pH ${o.ph}`:""}{o.ta?` · TA ${o.ta}g/L`:""}</div>}
                    {o.weight&&<div style={{fontSize:9,color:WARM,marginTop:1}}>Rendement: {o.weight}kg/ha</div>}
                  </div>
                ))}
                {obsP.length>3&&<div style={{fontSize:9,color:MID,marginTop:4,textAlign:"right"}}>+{obsP.length-3} observations</div>}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:MID,marginBottom:6}}>
                <span>{ts.length} traitement{ts.length!==1?"s":""}</span>
                <span>Cu {cu.total.toFixed(3)}/{cu.limit.toFixed(1)}kg</span>
              </div>
              <div style={css.track}><div style={{...css.bar,width:`${cu.pct}%`,background:cu.pct>80?"#B83232":TEAL}}/></div>
              <button onClick={()=>setParcelles(prev=>prev.filter(x=>x.id!==p.id&&String(x.parentId)!==String(p.id)))} style={{...css.del,marginTop:10}}>{T("delete")} la parcelle</button>
            </Box>);
          })}
        </Col>)}

        {/* ════ AGENDA ════ */}
        {tab==="agenda"&&(<Col>
          <PriBtn onClick={()=>setShowAF(p=>!p)}>{T("add_absence")}</PriBtn>
          {showAF&&(<Box title="Nouvelle absence"><Col>
            <F label="Destination"><input value={aForm.destination} onChange={e=>setAForm(p=>({...p,destination:e.target.value}))} style={css.inp} placeholder="Prowein, Paris, Vinitaly…"/></F>
            <div style={{display:"flex",gap:8}}>
              <F label="Départ"><input type="date" value={aForm.start} onChange={e=>setAForm(p=>({...p,start:e.target.value}))} style={css.dateInp}/></F>
              <F label="Retour"><input type="date" value={aForm.end} onChange={e=>setAForm(p=>({...p,end:e.target.value}))} style={css.dateInp}/></F>
            </div>
            <PriBtn onClick={addAbsence}>{T("save")}</PriBtn>
          </Col></Box>)}
          {absences.length===0?<Info>Aucun déplacement planifié. Ajoutez vos absences pour des alertes anticipées.</Info>
          :absences.sort((a,b)=>a.start.localeCompare(b.start)).map(a=>{
            const isPast=a.end<today,isCurrent=a.start<=today&&a.end>=today;
            const daysUntil=Math.ceil((new Date(a.start)-new Date())/86400000);
            const alerts=parcelles.map(p=>{const atEnd=riskAtReturn(p.id,a);const max=atEnd?Math.max(atEnd.peronospora,atEnd.mildew,atEnd.botrytis):0;return{p,max,v:lv(max)};}).filter(x=>x.max>=.40);
            return(<Box key={a.id} title={a.destination||"Déplacement"} sub={`${new Date(a.start).toLocaleDateString("fr-FR")} → ${new Date(a.end).toLocaleDateString("fr-FR")}`}>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                {isCurrent&&<span style={{...css.pill,background:lv(.75).bg,color:"#B83232"}}>EN COURS</span>}
                {!isCurrent&&!isPast&&daysUntil>=0&&<span style={{...css.pill,background:lv(.10).bg,color:TEAL_D}}>Dans {daysUntil}j</span>}
                {isPast&&<span style={{...css.pill,background:STONE,color:MID}}>Passé</span>}
              </div>
              {!isPast&&alerts.length>0&&(<div>
                <div style={{fontSize:9,color:MID,letterSpacing:.8,marginBottom:4}}>RISQUE ESTIMÉ AU RETOUR</div>
                {alerts.map(({p,max,v})=>(<div key={p.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <span style={{fontSize:9,color:MID,flex:1}}>{p.name}</span>
                  <div style={{width:70,height:3,background:STONE,borderRadius:1}}><div style={{width:`${max*100}%`,height:"100%",background:v.c,borderRadius:1}}/></div>
                  <span style={{fontSize:9,color:v.c,width:52,textAlign:"right"}}>{(max*100).toFixed(0)}% {v.label}</span>
                </div>))}
                {alerts.some(x=>x.max>=.65)&&<div style={{marginTop:6,padding:"6px 8px",background:lv(.75).bg,borderRadius:4,fontSize:10,color:"#B83232"}}>⚠ {T("treat_before")}</div>}
              </div>)}
              <button onClick={()=>setAbsences(prev=>prev.filter(x=>x.id!==a.id))} style={{...css.del,marginTop:8}}>{T("delete")}</button>
            </Box>);
          })}
        </Col>)}

        {/* ════ ANALYSE IA ════ */}
        {tab==="ai"&&(<Col>
          <Box title="Analyse experte — IA">
            <p style={{fontSize:12,color:MID,lineHeight:1.75,marginBottom:16}}>
              Analyse basée sur météo temps réel, modèles épidémiologiques, état des parcelles et agenda de déplacements.
            </p>
            <PriBtn onClick={runAI} disabled={aiLoading}>{aiLoading?T("analyzing"):T("expert_analysis")}</PriBtn>
          </Box>
          {aiText&&(<Box title={T("agronomic_report")}
            action={<TxtBtn onClick={()=>exportAIAnalysisPDF(aiText,weather,baseRisks,parcelles)}>PDF</TxtBtn>}>
            <div style={{fontSize:13,color:INK,lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"DM Serif Display,serif",fontWeight:300}}>{aiText}</div>
          </Box>)}
          {/* Mode Expert — Weekly report */}
          <Box title="Mode Expert">
            <div style={{fontSize:11,color:MID,marginBottom:10,lineHeight:1.6}}>
              {T("weekly_email")}<br/>
              <span style={{fontSize:9,color:inReportPeriod()?TEAL_D:"#C0A882"}}>
                {inReportPeriod()?"● Période active":"○ Hors période (1 mai – 15 juil.)"}
              </span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <PriBtn onClick={()=>exportWeeklyPDF(parcelles,treatments,observations,weather,baseRisks,forecast,lang)}>{T("weekly_report")} PDF</PriBtn>
              <SecBtn onClick={sendWeeklyEmail}>{T("send_report")}</SecBtn>
            </div>
          </Box>
          <Box title="Produits & Concentrations">
            <div style={{fontSize:11,color:MID,lineHeight:2}}>
              {products.map(p=><div key={p.id}>{p.name} · {p.cu>0?`${(p.cu*1000).toFixed(0)}g Cu/${p.unit}`:`${(p.s*1000).toFixed(0)}g S/${p.unit}`}</div>)}
              <div style={{color:STONE,fontSize:9,marginTop:4}}>——</div>
              <div>Limite Cu · 4 kg/ha/an · 28 kg/ha sur 7 ans (Règl. UE 2021/2279)</div>
            </div>
          </Box>
        </Col>)}

        {/* ════ PROFIL ════ */}
        {tab==="works"&&<Travaux T={T} lang={lang} parcelles={parcelles} treatments={treatments} invoices={invoices} works={works} setWorks={setWorks} projects={projects} setProjects={setProjects} tasks={tasks} setTasks={setTasks} season={season} setSeason={setSeason} notify={notify}/>}

        {tab==="buy"&&<Achats T={T} lang={lang} parcelles={parcelles} products={products} setProducts={setProducts} treatments={treatments} invoices={invoices} setInvoices={setInvoices} stockCounts={stockCounts} setStockCounts={setStockCounts} season={season} setSeason={setSeason} notify={notify}/>}

        {tab==="profile"&&(<Col>
          <Box title={T("profile_title")}>
            {session&&(
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:PARCH,border:`1px solid ${STONE}`,borderRadius:4,marginBottom:14}}>
                {session.picture&&<img src={session.picture} style={{width:32,height:32,borderRadius:"50%",flexShrink:0}} referrerPolicy="no-referrer"/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:500,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.name||session.email}</div>
                  <div style={{fontSize:10,color:MID,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.email}</div>
                </div>
                <button onClick={handleSignOut} style={{...css.del,fontSize:10,color:"#B83232",whiteSpace:"nowrap",flexShrink:0}}>Déconnexion</button>
              </div>
            )}
            {/* Language selector */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:9,color:MID,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>{T("language")}</div>
              <div style={{display:"flex",gap:8}}>
                {[["fr","Français"],["en","English"],["it","Italiano"]].map(([code,label])=>(
                  <button key={code} onClick={()=>setLang(code)}
                    style={{flex:1,padding:"8px 4px",borderRadius:4,border:`1px solid ${lang===code?TEAL:STONE}`,background:lang===code?TEAL:"transparent",color:lang===code?"white":MID,fontSize:11,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sign-in buttons — only visible when NOT logged in */}
            

            {/* Profile fields */}
            <Col>
              <F label={T("name")}><input value={user.name} onChange={e=>setUser(u=>({...u,name:e.target.value}))} style={css.inp} placeholder="Sébastien…"/></F>
              <F label={T("email")}><input type="email" value={user.email} onChange={e=>setUser(u=>({...u,email:e.target.value}))} style={css.inp} placeholder="contact@laripresa.it"/></F>
              <F label={T("phone")}><input type="tel" value={user.phone} onChange={e=>setUser(u=>({...u,phone:e.target.value}))} style={css.inp} placeholder="+39 …"/></F>
            </Col>

            <Compte T={T} lang={lang} session={session} sync={sync} notify={notify}/>

            {/* Notification settings */}
            <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${STONE}`}}>
              <div style={{fontSize:9,color:MID,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Notifications</div>
              {[[T("email_notif"),"emailAlerts"],[T("weekly_email"),"weeklyEmail"]].map(([label,key])=>(
                <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:12,color:INK}}>{label}</span>
                  <button onClick={()=>setUser(u=>({...u,[key]:!u[key]}))}
                    style={{width:42,height:24,borderRadius:12,border:"none",cursor:"pointer",background:user[key]?TEAL:STONE,position:"relative",transition:"background .2s"}}>
                    <div style={{width:18,height:18,borderRadius:"50%",background:"white",position:"absolute",top:3,left:user[key]?21:3,transition:"left .2s"}}/>
                  </button>
                </div>
              ))}
            </div>

          </Box>
        </Col>)}

      </div>
    </div>
  );
}
