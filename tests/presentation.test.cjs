'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../presentation.js'),'utf8');
function harness(reduce=false,support=true){
 const listeners={},buttons={},timers=new Map(),oscillators=[],saved=new Map(),animations=[];let clock;
 function button(){return {style:{},handlers:{},setAttribute(k,v){this[k]=v},addEventListener(k,fn){this.handlers[k]=fn}}}
 buttons.musicBtn=button();buttons.effectsBtn=button();
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v}});
 class Audio{constructor(){clock=this;this.currentTime=0;this.state='running';this.destination={};}createGain(){return {gain:param(),connect(){},disconnect(){}}}createOscillator(){const node={frequency:param(),connect(){},disconnect(){},start(t){this.started=t},stop(t){this.stopped=t}};oscillators.push(node);return node}resume(){this.state='running';return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}}
 const media={matches:reduce,addEventListener(){}};
 const doc={hidden:false,getElementById:id=>buttons[id],addEventListener:(k,fn)=>listeners[k]=fn};
 const win={AudioContext:support?Audio:undefined,localStorage:{getItem:k=>saved.has(k)?saved.get(k):null,setItem:(k,v)=>saved.set(k,v)},matchMedia:()=>media,setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id)};
 function target(){return {style:{},animate(){},cloneNode(){return {style:{},setAttribute(){},querySelector(){return {}},remove(){this.removed=true},animate(frames,options){const animation={frames,options,cancel(){this.cancelled=true}};animations.push(animation);return animation}}}}}
 let piece=target();const board={clientWidth:400,clientHeight:400,querySelector:()=>piece,getBoundingClientRect:()=>({left:0,top:0})};const wrap={appendChild(){},getBoundingClientRect:()=>({left:0,top:0})};
 const ctx={window:win};vm.createContext(ctx);vm.runInContext(source,ctx);
 const api=win.MakrukPresentation.create({document:doc,window:win,board,wrap});
 return {api,doc,buttons,listeners,timers,oscillators,animations,media,get clock(){return clock},get piece(){return piece},rerender(){piece=target()}};
}
const move={from:{r:4,c:3},to:{r:2,c:4},check:false,src:'wN.svg'};
const h=harness();assert.equal(h.clock,undefined,'no audio context before user gesture');h.listeners.pointerdown();assert(h.clock);assert.equal(h.timers.size,1,'music is on by default once a gesture unlocks audio');assert(h.oscillators.length>0);h.buttons.musicBtn.handlers.click();assert.equal(h.timers.size,0,'music can be turned off');assert.equal(h.buttons.musicBtn['aria-pressed'],'false');h.oscillators.length=0;
h.api.queueMove(move);assert.equal(h.oscillators.length,1);h.api.flush();assert.equal(h.animations.length,1);assert.equal(h.piece.style.visibility,'hidden');assert.equal(h.animations[0].options.duration,210);assert.equal(h.animations[0].frames[0].transform,'translate(-50px,100px)');
h.rerender();h.api.flush();assert.equal(h.piece.style.visibility,'hidden');h.animations[0].onfinish();assert.equal(h.piece.style.visibility,'');assert.equal(h.oscillators.length,1,'render does not replay sound');
h.api.queueMove({...move,check:true});assert.equal(h.oscillators.length,4,'check adds two distinct chimes');h.api.flush();h.api.clearMotion();assert(h.animations[1].cancelled);assert.equal(h.piece.style.visibility,'');
h.buttons.effectsBtn.handlers.click();h.api.queueMove(move);assert.equal(h.oscillators.length,4,'muted effects schedule no sound');
h.buttons.musicBtn.handlers.click();assert.equal(h.timers.size,1);const first=h.oscillators.length;for(let i=0;i<600;i++){h.clock.currentTime+=.1;h.timers.get(1)();}assert(h.oscillators.length>first+40,'music continues over two complete loops');
h.doc.hidden=true;h.listeners.visibilitychange();assert.equal(h.timers.size,0);assert.equal(h.clock.state,'suspended');const hiddenCount=h.oscillators.length;h.api.queueMove({...move,check:true});assert.equal(h.oscillators.length,hiddenCount);
const r=harness(true);r.api.queueMove(move);r.api.flush();assert.equal(r.animations.length,0,'respects reduced motion');assert.equal(r.api.replyDelay(),100);
const d=harness();d.api.queueMove({...move,skipAnimation:true});d.api.flush();assert.equal(d.animations.length,0,'dragged pieces do not jump back to origin');
const unsupported=harness(false,false);unsupported.listeners.pointerdown();assert(unsupported.buttons.musicBtn.disabled);unsupported.api.queueMove(move);unsupported.api.flush();
console.log('Presentation verified: gesture-only audio, music on by default, two music loops, move/check/mute cues, hidden-tab pause, 210ms motion, redraw cleanup, reduced motion and drag handling.');
// Mission feedback is distinct, gesture-gated, throttled and uses the effects mute.
const outcomes=harness();outcomes.api.playResult('complete');assert.equal(outcomes.oscillators.length,0);
outcomes.listeners.pointerdown();outcomes.buttons.musicBtn.handlers.click();outcomes.oscillators.length=0;outcomes.api.playResult('success');assert.equal(outcomes.oscillators.length,3);
outcomes.api.playResult('failure');assert.equal(outcomes.oscillators.length,3,'rapid taps cannot stack outcome sounds');
outcomes.clock.currentTime=1;outcomes.api.playResult('failure');assert.equal(outcomes.oscillators.length,5);assert(outcomes.oscillators.slice(-2).every(n=>n.type==='triangle'));
outcomes.clock.currentTime=2;outcomes.api.playResult('complete');assert.equal(outcomes.oscillators.length,9);assert(outcomes.oscillators.slice(-4).every(n=>n.type==='sine'));
outcomes.buttons.effectsBtn.handlers.click();outcomes.clock.currentTime=3;outcomes.api.playResult('failure');assert.equal(outcomes.oscillators.length,9);
outcomes.buttons.effectsBtn.handlers.click();outcomes.doc.hidden=true;outcomes.listeners.visibilitychange();outcomes.api.playResult('complete');assert.equal(outcomes.oscillators.length,9);
console.log('Mission audio verified: success, completion, failure, mute, hidden-tab pause and rapid-input suppression.');
