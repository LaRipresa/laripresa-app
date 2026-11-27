import { css, TEAL, WARM, MID } from "./theme.js";

export const Col=({children})=><div style={{display:"flex",flexDirection:"column",gap:12}}>{children}</div>;
export const Box=({title,sub,children,action})=>(<div style={css.box}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
    <div><div style={css.boxTitle}>{title}</div>{sub&&<div style={css.boxSub}>{sub}</div>}</div>
    {action&&<div style={{flexShrink:0,marginLeft:8}}>{action}</div>}
  </div>
  {children}
</div>);
export const Stat=({v,l})=>(<div style={css.stat}>
  <div style={{fontSize:20,fontWeight:300,color:WARM,fontFamily:"DM Serif Display,serif"}}>{v}</div>
  <div style={{fontSize:8,color:MID,marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>{l}</div>
</div>);
export const Info=({children,warn})=>(<div style={{...css.info,...(warn?{borderColor:"#B83232",color:"#B83232"}:{})}}>{children}</div>);
export const F=({label,children})=>(<div><div style={css.fieldLabel}>{label}</div>{children}</div>);
export const TxtBtn=({children,onClick})=>(<button onClick={onClick} style={{background:"none",border:"none",color:TEAL,fontSize:11,cursor:"pointer",padding:0,fontFamily:"DM Sans,sans-serif"}}>{children}</button>);
export const PriBtn=({children,onClick,disabled})=>(<button onClick={onClick} disabled={disabled} style={{...css.pri,...(disabled?{opacity:.5}:{})}}>{children}</button>);
export const SecBtn=({children,onClick,full})=>(<button onClick={onClick} style={full?{...css.sec,width:"100%"}:css.sec}>{children}</button>);

// Sous-onglets
export const Seg=({value,onChange,options})=>(<div style={{display:"flex",background:"#EDE8DE",borderRadius:4,padding:2,gap:2}}>
  {options.map(([k,l])=>(<button key={k} onClick={()=>onChange(k)} style={{flex:1,padding:"8px 2px",border:"none",borderRadius:3,cursor:"pointer",fontSize:9,letterSpacing:1,textTransform:"uppercase",fontFamily:"DM Sans,sans-serif",background:value===k?"#FDFBF7":"transparent",color:value===k?"#1C1A17":MID,fontWeight:value===k?500:400}}>{l}</button>))}
</div>);
// Choix de la campagne (année)
export const SeasonPick=({value,onChange,years,label})=>(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
  <span style={css.sLabel}>{label} {value}</span>
  <div style={{display:"flex",gap:4,overflowX:"auto"}}>
    {years.map(y=>(<button key={y} onClick={()=>onChange(y)} style={{padding:"5px 9px",borderRadius:3,border:`1px solid ${value===y?TEAL:"#D8D0C0"}`,background:value===y?TEAL:"transparent",color:value===y?"#fff":MID,fontSize:11,cursor:"pointer",fontFamily:"DM Sans,sans-serif",flexShrink:0}}>{y}</button>))}
  </div>
</div>);
export const Chk=({on,onClick,label})=>(<button onClick={onClick} aria-pressed={!!on} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:"6px 0",cursor:"pointer",textAlign:"left",fontFamily:"DM Sans,sans-serif",width:"100%"}}>
  <span style={{width:18,height:18,borderRadius:3,border:`1px solid ${on?TEAL:"#C8BEAA"}`,background:on?TEAL:"transparent",color:"#fff",fontSize:12,lineHeight:"16px",textAlign:"center",flexShrink:0}}>{on?"✓":""}</span>
  <span style={{fontSize:12,color:on?MID:"#1C1A17",textDecoration:on?"line-through":"none"}}>{label}</span>
</button>);
export const Row=({children})=>(<div style={{display:"flex",gap:8}}>{[].concat(children).map((c,i)=>c&&<div key={i} style={{flex:1,minWidth:0}}>{c}</div>)}</div>);
export const locOf=lang=>lang==="it"?"it-IT":lang==="en"?"en-GB":"fr-FR";
export const fmtDate=(d,lang,opt={day:"numeric",month:"short",year:"2-digit"})=>{try{return new Date(d).toLocaleDateString(locOf(lang),opt);}catch{return d;}};
export const yearsOf=(...lists)=>{const now=new Date().getFullYear();const s=new Set([now]);lists.flat().forEach(r=>{const y=parseInt(String(r?.date||r?.start||"").slice(0,4));if(y>2000&&y<=now+1)s.add(y);});return[...s].sort((a,b)=>b-a);};
