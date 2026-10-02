import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const app=readFileSync('web/public/assets/app.js','utf8');
const start=app.indexOf('function showDemoStartupFailure(){');
const end=app.indexOf('\nfunction syncDemoBootProgress',start);
function shell(mode='demo',authLocked=false,existingWizard=false){
  const nodes=new Map<string,Record<string,unknown>>();
  if(existingWizard)nodes.set('setupWizardView',{value:'Fictional entered organization'});
  let rendered=0,locked=false;
  const window={erpDataMode:()=>mode,__ERP_DEMO_PROGRESS__:{phase:'failed'},ErpDemoDiagnostics:{render:()=>{rendered++;}}};
  const document={body:{classList:{contains:()=>authLocked},insertBefore:(node:Record<string,unknown>)=>{nodes.set(String(node.id),node);}},getElementById:(id:string)=>nodes.get(id)||null,createElement:()=>({setAttribute:()=>{},focus:()=>{}})};
  const context=vm.createContext({window,document,demoStartupCopy:()=>({failed:'Startup did not finish. Existing data has not been reset.'}),esc:(text:string)=>text,setAuthShell:(value:boolean)=>{locked=value;},localStorage:{getItem:()=>{throw new Error('Stored session must not be inspected/changed');},setItem:()=>{throw new Error('Stored session must not be changed');},removeItem:()=>{throw new Error('Stored session must not be removed');}}});
  vm.runInContext(app.slice(start,end)+'\n globalThis.show=showDemoStartupFailure;',context);
  return {context,nodes,window,rendered:()=>rendered,locked:()=>locked};
}
describe('retained signed-in Demo failure shell',()=>{
  it('locks failed workspace access and exposes one persistent diagnostic host without changing stored flags',()=>{
    const test=shell();
    expect(test.context.show()).toBe(true);
    expect(test.locked()).toBe(true);
    expect(String(test.nodes.get('demoFailureView')?.innerHTML)).toContain('data-demo-diagnostic');
    expect(test.context.show()).toBe(true);
    expect(test.nodes.size).toBe(1);
    expect(test.rendered()).toBe(2);
  });
  it('preserves existing wizard inputs on late failure',()=>{
    const test=shell('demo',true,true);
    expect(test.context.show()).toBe(true);
    expect(test.nodes.get('setupWizardView')?.value).toBe('Fictional entered organization');
    expect(test.nodes.has('demoFailureView')).toBe(false);
    expect(test.rendered()).toBe(1);
  });
  it('does not affect API mode or a still-running watchdog fallback',()=>{
    const api=shell('api');expect(api.context.show()).toBe(false);expect(api.nodes.size).toBe(0);
    const pending=shell();pending.window.__ERP_DEMO_PROGRESS__.phase='fallback';expect(pending.context.show()).toBe(false);expect(pending.nodes.size).toBe(0);
  });
  it('guards the actual final unlock when a failed event arrived during the awaited boot gap',()=>{
    const nodes=new Map<string,Record<string,unknown>>();
    let locked=false,rendered=0;
    const events=new Map<string,(event:{detail:{phase:string}})=>void>();
    const window={erpDataMode:()=> 'demo',__ERP_DEMO_PROGRESS__:{phase:'fallback'},ErpDemoDiagnostics:{render:()=>{rendered++;}},addEventListener:(name:string,callback:(event:{detail:{phase:string}})=>void)=>events.set(name,callback)};
    const element=()=>({setAttribute:()=>{},focus:()=>{},remove:()=>{}});
    nodes.set('app',element());nodes.set('tabbar',element());
    const document={body:{classList:{contains:()=>locked,toggle:(_name:string,value:boolean)=>{locked=value;}},insertBefore:(node:Record<string,unknown>)=>nodes.set(String(node.id),node)},getElementById:(id:string)=>nodes.get(id)||null,createElement:element};
    const context=vm.createContext({window,document,$:(selector:string)=>nodes.get(selector.slice(1))||null,demoStartupCopy:()=>({failed:'Startup did not finish. Existing data has not been reset.'}),esc:(text:string)=>text,syncDemoBootProgress:()=>{}});
    const functionsStart=app.indexOf('let demoAuthShellRendered=false;');
    vm.runInContext(app.slice(functionsStart,end),context);
    const eventStart=app.indexOf("if(typeof window!=='undefined') window.addEventListener('erp:demo-progress',event=>{");
    const eventEnd=app.indexOf('\nfunction syncAccountUi',eventStart);
    vm.runInContext(app.slice(eventStart,eventEnd),context);
    window.__ERP_DEMO_PROGRESS__.phase='failed';
    events.get('erp:demo-progress')!({detail:{phase:'failed'}});
    expect(nodes.has('demoFailureView')).toBe(false);
    context.setAuthShell(false);
    expect(locked).toBe(true);
    expect(nodes.has('demoFailureView')).toBe(true);
    expect(rendered).toBe(1);
  });
});
