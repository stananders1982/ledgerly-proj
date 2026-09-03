/** Dense individual-lead grid and leads-first conversion workflow. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyEmployee } from "@/lib/my-employee";
import { useMyRoleKey } from "@/lib/permissions";
import { fetchAll } from "@/lib/fetch-all";
import { fmtDate, todayISO } from "@/lib/format";
import { ContactActions } from "@/components/contact-actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { TableFrame } from "@/components/table-frame";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "__none__";
const STATUSES = ["new", "contacted", "qualified", "lost", "activated"] as const;
type LeadStatus = (typeof STATUSES)[number];
type Lead = { id:string; name:string; phone:string|null; email:string|null; source_id:string|null; affiliate_id:string|null; employee_id:string|null; status:LeadStatus; notes:string|null; activated:boolean; activation_id:string|null; created_at:string; lead_sources?:{name:string}|null; affiliates?:{name:string}|null };
type Agent = {id:string;name:string;active:boolean;team?:string|null};
type Form = {id?:string;name:string;phone:string;email:string;source_id:string;affiliate_id:string;employee_id:string;status:LeadStatus;notes:string};
const blank = (): Form => ({name:"",phone:"",email:"",source_id:"",affiliate_id:"",employee_id:"",status:"new",notes:""});

export function IndividualLeads({ createSignal = 0 }: { createSignal?: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const { roleKey } = useMyRoleKey();
  const { employee } = useMyEmployee();
  const [form, setForm] = useState<Form|null>(null);
  const [convert, setConvert] = useState<Lead|null>(null);
  const [retentionId, setRetentionId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("all");
  const [agent, setAgent] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seenSignal, setSeenSignal] = useState(createSignal);
  if (createSignal !== seenSignal) { setSeenSignal(createSignal); setForm(blank()); }

  const leadsQ = useQuery({ queryKey:["individual-leads",companyId], enabled:!!companyId, queryFn:async()=> {
    const data = await fetchAll(()=>supabase.from("leads").select("id,name,phone,email,source_id,affiliate_id,employee_id,status,notes,activated,activation_id,created_at,lead_sources(name),affiliates(name)").order("created_at",{ascending:false}));
    return (data??[]) as unknown as Lead[];
  }});
  const agentsQ = useQuery({queryKey:["employees-directory"],queryFn:async()=>{const {data,error}=await supabase.rpc("list_employees_directory");if(error)throw error;return (data??[]) as Agent[];}});
  const sourcesQ = useQuery({queryKey:["sources-min"],queryFn:async()=>fetchAll(()=>supabase.from("lead_sources").select("id,name").eq("active",true).order("name"))});
  const affiliatesQ = useQuery({queryKey:["affiliates-min"],queryFn:async()=>fetchAll(()=>supabase.from("affiliates").select("id,name").eq("active",true).order("name"))});
  const conversionAgents=(agentsQ.data??[]).filter(a=>a.team==="C"&&a.active!==false);
  const retentionAgents=(agentsQ.data??[]).filter(a=>a.team==="R"&&a.active!==false);
  const nameOf=(id:string|null)=> (agentsQ.data??[]).find(a=>a.id===id)?.name??"Unassigned";

  const rows=useMemo(()=> (leadsQ.data??[]).filter(l=>{
    const term=search.trim().toLowerCase();
    if(term&&!`${l.name} ${l.phone??""} ${l.email??""}`.toLowerCase().includes(term))return false;
    if(status==="open"&&l.activated)return false;
    if(status!=="all"&&status!=="open"&&l.status!==status)return false;
    if(source!=="all"&&(l.affiliate_id??l.source_id??NONE)!==source)return false;
    if(agent!=="all"&&(l.employee_id??NONE)!==agent)return false;
    return true;
  }),[leadsQ.data,search,status,source,agent]);

  const save=useMutation({mutationFn:async(v:Form)=>{
    if (!companyId) throw new Error("No active workspace");
    const payload={name:v.name.trim(),phone:v.phone.trim()||null,email:v.email.trim()||null,source_id:v.source_id||null,affiliate_id:v.affiliate_id||null,employee_id:v.employee_id||null,status:v.status,notes:v.notes.trim()||null,company_id:companyId};
    const {error}=v.id?await supabase.from("leads").update(payload).eq("id",v.id):await supabase.from("leads").insert(payload);
    if(error)throw /unique/i.test(error.message)?new Error("A lead with this email already exists"):error;
  },onSuccess:()=>{qc.invalidateQueries({queryKey:["individual-leads"]});setForm(null);toast.success("Lead saved");},onError:(e:any)=>toast.error(e.message)});
  const patch=useMutation({mutationFn:async({id,p}:{id:string;p:Record<string,unknown>})=>{const {error}=await supabase.from("leads").update(p as any).eq("id",id);if(error)throw error;},onSuccess:()=>qc.invalidateQueries({queryKey:["individual-leads"]}),onError:(e:any)=>toast.error(e.message)});
  const remove=useMutation({mutationFn:async(id:string)=>{const {data,error}=await supabase.from("leads").delete().eq("id",id).select("id");if(error)throw error;if(!data?.length)throw new Error("Nothing was deleted — you don't have permission to delete leads");},onSuccess:()=>{qc.invalidateQueries({queryKey:["individual-leads"]});toast.success("Lead deleted");},onError:(e:any)=>toast.error(e.message)});
  const bulkAssign=useMutation({mutationFn:async(id:string)=>{const {error}=await supabase.from("leads").update({employee_id:id}).in("id",[...selected]);if(error)throw error;},onSuccess:()=>{setSelected(new Set());qc.invalidateQueries({queryKey:["individual-leads"]});toast.success("Leads assigned");}});
  const doConvert=useMutation({mutationFn:async()=>{
    if(!convert||!retentionId)throw new Error("Choose a retention agent");
    const {data:settings}=await supabase.from("company_settings").select("default_activation_balance").eq("company_id",companyId??"").maybeSingle();
    const {data:activation,error}=await supabase.from("daily_lead_activations").insert({lead_name:convert.name,phone:convert.phone,email:convert.email,employee_id:retentionId,conversion_employee_id:convert.employee_id,activation_date:todayISO(),balance:Number(settings?.default_activation_balance??250),potential:null,answered:false,legacy:false}).select("id").single();if(error)throw error;
    const {error:updateError}=await supabase.from("leads").update({activated:true,status:"activated",activation_id:activation.id}).eq("id",convert.id);if(updateError)throw updateError;
    return activation.id;
  },onSuccess:(id)=>{qc.invalidateQueries({queryKey:["individual-leads"]});qc.invalidateQueries({queryKey:["activated-leads"]});setConvert(null);setRetentionId("");toast.success("Lead converted to client");navigate({to:"/clients/$id",params:{id}});},onError:(e:any)=>toast.error(e.message)});

  const sourceOptions=(()=>{const seen=new Set<string>();const out:{id:string;name:string}[]=[];for(const o of [...(affiliatesQ.data??[]),...(sourcesQ.data??[])] as any[]){const k=(o.name??"").trim().toLowerCase();if(!k||seen.has(k))continue;seen.add(k);out.push({id:o.id,name:o.name});}return out;})();

  if(leadsQ.isLoading)return <TableSkeleton rows={8}/>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-xs" placeholder="Search name, phone or email" value={search} onChange={e=>setSearch(e.target.value)}/>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="open">Open leads</SelectItem><SelectItem value="all">All statuses</SelectItem>{STATUSES.map(s=><SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select>
      <Select value={source} onValueChange={setSource}><SelectTrigger className="w-44"><SelectValue placeholder="All affiliates"/></SelectTrigger><SelectContent><SelectItem value="all">All affiliates</SelectItem>{sourceOptions.map((o)=><SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
      <Select value={agent} onValueChange={setAgent}><SelectTrigger className="w-44"><SelectValue placeholder="All agents"/></SelectTrigger><SelectContent><SelectItem value="all">All conversion agents</SelectItem><SelectItem value={NONE}>Unassigned</SelectItem>{conversionAgents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
      <span className="text-sm text-muted-foreground">{rows.length} leads</span>
      <div className="ml-auto flex gap-2">{selected.size>0&&roleKey!=="agent"&&<Select onValueChange={v=>bulkAssign.mutate(v)}><SelectTrigger className="w-44"><SelectValue placeholder={`Assign ${selected.size}`}/></SelectTrigger><SelectContent>{conversionAgents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>}<Button onClick={()=>setForm({...blank(),employee_id:roleKey==="agent"&&employee?.team==="C"?employee.id:""})}><Plus className="h-4 w-4"/> Add lead</Button></div>
    </div>
    {rows.length===0?<EmptyState icon={Plus} title="No leads found" description="Add a lead by details or let affiliates send leads through the intake API." action={<Button onClick={()=>setForm(blank())}>Add lead</Button>}/>:<TableFrame resizeKey="individual-leads"><table className="w-full text-xs"><thead className="table-head bg-muted/40 text-muted-foreground"><tr><th className="w-10 p-2"><Checkbox checked={rows.length>0&&rows.every(r=>selected.has(r.id))} onCheckedChange={c=>setSelected(c?new Set(rows.map(r=>r.id)):new Set())}/></th><th className="min-w-52 p-2 text-left">Full name</th><th className="p-2 text-left">Contact</th><th className="p-2 text-left">Affiliate / source</th><th className="p-2 text-left">Conversion agent</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Received</th><th className="p-2 text-left">Notes</th><th className="p-2 text-right">Actions</th></tr></thead><tbody>{rows.map(l=><tr key={l.id} className="border-t odd:bg-muted/10 hover:bg-accent/30"><td className="p-2"><Checkbox checked={selected.has(l.id)} onCheckedChange={()=>setSelected(s=>{const n=new Set(s);n.has(l.id)?n.delete(l.id):n.add(l.id);return n;})}/></td><td className="p-2 font-medium">{l.name}<div className="text-muted-foreground">{l.email||l.phone||"No contact details"}</div></td><td className="p-2"><ContactActions phone={l.phone} email={l.email} name={l.name} size="icon"/></td><td className="p-2">{l.affiliates?.name??l.lead_sources?.name??"—"}</td><td className="p-2">{roleKey==="agent"?nameOf(l.employee_id):<Select value={l.employee_id??NONE} onValueChange={v=>patch.mutate({id:l.id,p:{employee_id:v===NONE?null:v}})}><SelectTrigger className="h-8 w-40 border-transparent"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={NONE}>Unassigned</SelectItem>{conversionAgents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>}</td><td className="p-2"><Select value={l.status} onValueChange={v=>patch.mutate({id:l.id,p:{status:v as LeadStatus}})} disabled={l.activated}><SelectTrigger className="h-8 w-32 border-transparent capitalize"><SelectValue/></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select></td><td className="p-2 whitespace-nowrap">{fmtDate(l.created_at)}</td><td className="max-w-56 truncate p-2" title={l.notes??""}>{l.notes||"—"}</td><td className="p-2"><div className="flex justify-end gap-1">{l.activation_id?<Button size="sm" variant="ghost" onClick={()=>navigate({to:"/clients/$id",params:{id:l.activation_id as string}})}><ExternalLink className="h-3 w-3"/> Client</Button>:<Button size="sm" onClick={()=>{setConvert(l);setRetentionId("")}}>Convert</Button>}<Button size="sm" variant="ghost" onClick={()=>setForm({id:l.id,name:l.name,phone:l.phone??"",email:l.email??"",source_id:l.source_id??"",affiliate_id:l.affiliate_id??"",employee_id:l.employee_id??"",status:l.status,notes:l.notes??""})}>Edit</Button><ConfirmDelete onConfirm={()=>remove.mutate(l.id)} label={`Delete ${l.name}?`} description="This removes the lead record. Converted client records are kept."/></div></td></tr>)}</tbody></table></TableFrame>}

    <Dialog open={!!form} onOpenChange={o=>!o&&setForm(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{form?.id?"Edit lead":"Add lead"}</DialogTitle></DialogHeader>{form&&<div className="grid gap-3 py-2"><Field label="Full name"><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Phone"><Input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Email"><Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Affiliate"><Select value={form.affiliate_id||NONE} onValueChange={v=>setForm({...form,affiliate_id:v===NONE?"":v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={NONE}>None</SelectItem>{(affiliatesQ.data??[]).map((a:any)=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Source"><Select value={form.source_id||NONE} onValueChange={v=>setForm({...form,source_id:v===NONE?"":v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={NONE}>None</SelectItem>{(sourcesQ.data??[]).map((s:any)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field></div><Field label="Conversion agent"><Select value={form.employee_id||NONE} onValueChange={v=>setForm({...form,employee_id:v===NONE?"":v})} disabled={roleKey==="agent"}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value={NONE}>Unassigned</SelectItem>{conversionAgents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Notes"><Textarea rows={4} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field></div>}<DialogFooter><Button onClick={()=>form&&save.mutate(form)} disabled={!form?.name.trim()||save.isPending}>{save.isPending?"Saving…":"Save lead"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!convert} onOpenChange={o=>!o&&setConvert(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Convert {convert?.name} to client</DialogTitle></DialogHeader><Field label="Retention agent"><Select value={retentionId||NONE} onValueChange={v=>setRetentionId(v===NONE?"":v)}><SelectTrigger><SelectValue placeholder="Choose retention agent"/></SelectTrigger><SelectContent><SelectItem value={NONE}>Choose…</SelectItem>{retentionAgents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></Field><DialogFooter><Button onClick={()=>doConvert.mutate()} disabled={!retentionId||doConvert.isPending}>{doConvert.isPending?"Converting…":"Convert to client"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>}
