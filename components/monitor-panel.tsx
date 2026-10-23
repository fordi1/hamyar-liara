'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {Area,AreaChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Activity,Cpu,MemoryStick,RefreshCw,Sparkles,RotateCcw,AlertTriangle,CheckCircle2,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';

type Props={projects:any[];plans:any[];operations:any[];approvalCard:(a:any)=>ReactNode;onAsk:(text:string)=>void;json:(url:string,body?:unknown)=>Promise<any>;onChanged:()=>void};
const fa=(n:number,d=0)=>n.toLocaleString('fa-IR',{maximumFractionDigits:d});
const toSeries=(r:any,scale:number)=>(r?.result?.[0]?.values||[]).map(([t,v]:any)=>({t:Number(t)*1000,v:Number(v)*scale}));
const clock=(t:number)=>new Date(t).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});

function Gauge({icon,label,value,limit,unit,tone}:{icon:ReactNode;label:string;value:number|null;limit:number|null;unit:string;tone:string}){
 const pct=value!=null&&limit?Math.min(100,value/limit*100):null;
 const color=pct==null?'bg-slate-300':pct>85?'bg-rose-500':pct>65?'bg-amber-500':tone;
 return <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</div><div className="mt-2 flex items-baseline gap-1"><b className="text-2xl">{value==null?'—':fa(value,value<1?3:value<10?2:0)}</b><span className="text-xs text-slate-400">{unit}{limit?` از ${fa(limit,2)}`:''}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{width:`${pct??0}%`}}/></div><p className="mt-2 text-[11px] text-slate-400">{pct==null?'محدودیت پلن نامشخص':`${fa(pct)}٪ ظرفیت پلن`}</p></div>;
}

function Chart({data,color,unit}:{data:{t:number;v:number}[];color:string;unit:string}){
 if(!data.length)return <p className="py-10 text-center text-xs text-slate-400">داده‌ای از API برنگشت</p>;
 return <div dir="ltr" className="h-40"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:8,right:8,left:-16,bottom:0}}><defs><linearGradient id={'g'+color} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.35}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><XAxis dataKey="t" tickFormatter={clock} tick={{fontSize:10}} minTickGap={40}/><YAxis tick={{fontSize:10}} width={56} tickFormatter={(v:number)=>v<1?v.toFixed(3):v.toFixed(0)}/><Tooltip labelFormatter={v=>clock(Number(v))} formatter={(v:any)=>[`${Number(v).toFixed(2)} ${unit}`,'']}/><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#g${color})`}/></AreaChart></ResponsiveContainer></div>;
}

export default function MonitorPanel({projects,plans,operations,approvalCard,onAsk,json,onChanged}:Props){
 const [project,setProject]=useState(''),[obs,setObs]=useState<any>(null),[series,setSeries]=useState<any>(null),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[updated,setUpdated]=useState<Date|null>(null);
 useEffect(()=>{if(!project&&projects?.length)setProject(projects[0].project_id)},[projects,project]);
 async function load(){if(!project)return;setLoading(true);setErr('');try{const [o,s]=await Promise.all([json('/api/liara?project='+encodeURIComponent(project)),json('/api/liara?project='+encodeURIComponent(project)+'&series=3600')]);setObs(o);setSeries(s);setUpdated(new Date());}catch(e){setErr(String(e).replace(/^Error: /,''));}finally{setLoading(false);}}
 useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[project]);
 const p=projects?.find(x=>x.project_id===project);
 const plan=plans?.find((x:any)=>x.id===p?.planID);
 const m=obs?.sources?.metrics?.data;
 const cpu=m?.cpuUsage?.[0]?Number(m.cpuUsage[0].value[1]):null;
 const ramMB=m?.memoryUsage?.[0]?Number(m.memoryUsage[0].value[1])/1048576:null;
 const ramLimit=typeof plan?.fields?.ramGB==='number'?plan.fields.ramGB*1024:null;
 const cpuLimit=typeof plan?.fields?.cpuCores==='number'?plan.fields.cpuCores:null;
 const logs:any[]=obs?.sources?.logs?.data||[];
 const findings:any[]=obs?.findings||[];
 const domains:any[]=obs?.sources?.domains?.data||[];
 const url=domains[0]?.name?`https://${domains[0].name}`:`https://${project}.liara.run`;
 const healthy=p?.status==='ACTIVE'&&!findings.length;
 const pending=(operations||[]).filter((o:any)=>o.state==='pending'&&o.payload.project===project);
 async function propose(action:'restart'|'scale'){try{await json('/api/liara',{op:'prepare',payload:{action,project,...(action==='scale'?{scale:p?.scale?0:1}:{})}});onChanged();}catch(e){setErr(String(e).replace(/^Error: /,''));}}
 if(!projects?.length)return <p className="text-sm text-slate-500">هنوز پروژه‌ای در حساب نیست؛ ابتدا از گفت‌وگو یک پروژه را آنلاین کنید.</p>;
 return <div className="space-y-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <select aria-label="انتخاب پروژه" value={project} onChange={e=>{setProject(e.target.value);setObs(null);setSeries(null)}} dir="ltr" className="rounded-xl border bg-white p-2.5 text-sm sm:w-64">{projects.map(x=><option key={x.project_id}>{x.project_id}</option>)}</select>
   <div className="flex items-center gap-2 text-xs text-slate-500">{updated&&<span>به‌روزرسانی: {updated.toLocaleTimeString('fa-IR')} · هر ۳۰ ثانیه</span>}<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'animate-spin':''}/> تازه‌سازی</Button></div>
  </div>
  {err&&<p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{err}</p>}
  <div className={`flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center ${healthy?'bg-gradient-to-l from-teal-50 to-white border border-teal-100':'bg-gradient-to-l from-amber-50 to-white border border-amber-100'}`}>
   {healthy?<CheckCircle2 className="text-teal-600" size={32}/>:<AlertTriangle className="text-amber-600" size={32}/>}
   <div className="flex-1"><b className="text-base">{!obs?'در حال دریافت وضعیت…':healthy?'سرویس سالم است':findings.length?`${fa(findings.length)} مورد نیازمند توجه`:'وضعیت سرویس: '+(p?.status??'نامشخص')}</b><p className="mt-1 text-xs text-slate-500" dir="auto">{p?.type} · پلن {String(p?.planID??'نامشخص')} · وضعیت API: {String(p?.status??'—')}</p></div>
   <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-indigo-600" dir="ltr">{url.replace('https://','')}<ExternalLink size={12}/></a>
  </div>
  <div className="grid gap-3 sm:grid-cols-2"><Gauge icon={<Cpu size={14}/>} label="پردازنده" value={cpu} limit={cpuLimit} unit="هسته" tone="bg-indigo-500"/><Gauge icon={<MemoryStick size={14}/>} label="حافظه" value={ramMB} limit={ramLimit} unit="مگابایت" tone="bg-teal-500"/></div>
  <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-2xl border bg-white p-4"><p className="mb-2 text-xs text-slate-500">CPU · یک ساعت اخیر (هسته)</p><Chart data={toSeries(series?.cpu,1)} color="#6366f1" unit="core"/></div><div className="rounded-2xl border bg-white p-4"><p className="mb-2 text-xs text-slate-500">RAM · یک ساعت اخیر (مگابایت)</p><Chart data={toSeries(series?.memory,1/1048576)} color="#14b8a6" unit="MB"/></div></div>
  {findings.length>0&&<div className="space-y-2">{findings.map((f,i)=><div key={i} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"><b className="text-sm">{f.title}</b><p className="mt-1 text-xs leading-7">{f.fix}</p>{f.evidence?.length>0&&<pre dir="ltr" className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{f.evidence.join('\n')}</pre>}</div>)}</div>}
  <div className="flex flex-wrap gap-2"><Button onClick={()=>onAsk(`پروژه ${project} را کامل بررسی کن: لاگ‌ها، مصرف CPU و RAM و وضعیت انتشار. علت‌های احتمالی هر مشکل را اولویت‌بندی کن و راهکار بده.`)}><Sparkles size={16}/> تحلیل هوشمند با همیار</Button><Button variant="outline" onClick={()=>propose('restart')}><RotateCcw size={16}/> پیشنهاد ری‌استارت</Button></div>
  {pending.map(approvalCard)}
  <details className="rounded-2xl border bg-white p-4" open={logs.length>0&&logs.length<40}><summary className="cursor-pointer text-sm"><Activity size={14} className="ml-1 inline"/>لاگ‌های یک ساعت اخیر ({fa(logs.length)})</summary><pre dir="ltr" className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{logs.length?logs.map(l=>`${l.datetime?new Date(String(l.datetime)).toLocaleTimeString('en-GB'):''}  ${l.message}`).join('\n'):'لاگی ثبت نشده'}</pre></details>
 </div>;
}
