'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const player = require('../assets/listening-player.js');
const base = 'http://127.0.0.1:8765/学习课程.html';

test('audio source is constrained to same-origin local audio rather than executable or external content', () => {
  assert.equal(player.safeSource('audio/curriculum/w01-listen-1.mp3', base), 'http://127.0.0.1:8765/audio/curriculum/w01-listen-1.mp3');
  assert.equal(player.safeSource('/audio/a.wav?v=1', base), 'http://127.0.0.1:8765/audio/a.wav?v=1');
  for (const src of ['https://foreign.example/a.mp3', '//foreign.example/a.mp3', 'javascript:alert(1)', 'data:audio/wav;base64,AAAA', 'blob:http://127.0.0.1:8765/id', '/AI设置.html', 'http://name:password@127.0.0.1:8765/audio/a.mp3', 'audio\\a.mp3', 'audio/a.mp3#other']) assert.throws(() => player.safeSource(src, base));
  const fileBase = 'file:///C:/learning/学习课程.html';
  assert.equal(player.safeSource('audio/a.mp3', fileBase), 'file:///C:/learning/audio/a.mp3');
  assert.throws(() => player.safeSource('../private/a.mp3', fileBase));
});

test('coverage records actual elapsed playback and rejects jumping to the end without seek events', () => {
  let now = 0; const coverage = player.createCoverage({ now: () => now }); coverage.resetAnchor(0, true);
  now = 1000; coverage.sample(1, true); now = 1100; assert.equal(coverage.sample(59, true).jump, true);
  now = 2100; coverage.sample(60, true); assert.equal(coverage.state(60).complete, false); assert.equal(coverage.state(60).coveredSeconds, 2);
  coverage.clear(); now = 0; coverage.resetAnchor(0, true);
  for (let second = 1; second <= 60; second++) { now = second * 1000; coverage.sample(second, true); }
  assert.equal(coverage.state(60).complete, true); assert.equal(coverage.state(60).coveredSeconds, 60);
});

function browser(options = {}) {
  const env = { now: 0, events: [], elements: [], rejected: null, withheld: null, ...options };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = new Map(); this.dataset = {}; this.attrs = {}; this.hidden = false; this.disabled = false; this.textContent = ''; env.elements.push(this); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; if (name === 'src') this.src = ''; }
    fire(name) { for (const fn of [...(this.listeners.get(name) || [])]) fn({ target: this, type: name }); }
  }
  class Audio extends Element {
    constructor() { super('audio'); this.currentTime = 0; this.duration = 10; this.paused = true; this.ended = false; this.seeking = false; this.muted = false; this.volume = 1; this.playbackRate = 1; this.error = null; this.plays = 0; this.loads = 0; this.nativeRanges = []; }
    get played() { if (!env.nativePlayed) return undefined; const snapshot = this.nativeRanges.map(r => r.slice()); return { length: snapshot.length, start: i => snapshot[i][0], end: i => snapshot[i][1] }; }
    async play() {
      this.plays++; this.fire('play');
      if (env.rejected) throw env.rejected;
      if (env.withheld) await env.withheld;
      this.paused = false; this.ended = false; this.fire('playing');
    }
    pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
    load() { this.loads++; this.currentTime = 0; this.ended = false; this.error = null; this.nativeRanges = []; }
  }
  const context = { document: { createElement: tag => tag === 'audio' ? new Audio() : new Element(tag) }, URL, Date, Number, Math, Object, Set, Error, Promise, location: { href: base } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/listening-player.js'), 'utf8'), context);
  const host = new Element('div');
  const controller = context.IELTSListeningPlayer.mount(host, { src: options.src || 'audio/curriculum/w01-listen-1.mp3', assessment: options.assessment === true, now: () => env.now, onAvailable: (value, detail) => env.events.push({ type: 'available', value, detail }), onComplete: (value, detail) => env.events.push({ type: 'complete', value, detail }), onAssistance: (value, detail) => env.events.push({ type: 'assistance', value, detail }), onError: value => env.events.push({ type: 'error', value }) });
  const audio = env.elements.find(e => e.tagName === 'audio'), controls = host.children[0].children[1];
  return Object.assign(env, { host, controller, audio, playButton: controls.children[0], reloadButton: controls.children[1], status: host.children[0].children[2], advance(seconds, emit = true) { env.now += seconds / audio.playbackRate * 1000; const start = audio.currentTime; audio.currentTime += seconds; if (!audio.paused && !audio.seeking) { const last=audio.nativeRanges.at(-1); if (last && Math.abs(last[1]-start)<.001) last[1]=audio.currentTime; else audio.nativeRanges.push([start,audio.currentTime]); } if (emit) audio.fire('timeupdate'); }, finish() { audio.currentTime = audio.duration; audio.paused = true; audio.ended = true; audio.fire('ended'); } });
}

test('native audio controls register real playback and only complete after the entire audible timeline', async () => {
  const page = browser(); assert.equal(page.audio.controls, true);
  page.audio.fire('play'); assert.equal(page.events.some(e => e.type === 'available' && e.value), false, 'play requested is not proof audio started');
  await page.audio.play(); assert.equal(page.controller.getState().available, true);
  for (let i = 0; i < 10; i++) page.advance(1);
  assert.equal(page.events.some(e => e.type === 'complete' && e.value), false, 'timeupdate alone cannot claim the file ended');
  page.finish(); assert.equal(page.controller.getState().complete, true); assert.equal(page.events.filter(e => e.type === 'complete' && e.value).length, 1);
  page.controller.destroy();
});

test('seeking near the tail and then ended does not mark a listening task complete', async () => {
  const page = browser(); await page.controller.play(); page.advance(1);
  page.audio.seeking = true; page.audio.currentTime = 9.5; page.audio.fire('seeking'); page.audio.seeking = false; page.audio.fire('seeked'); page.advance(0.5); page.finish();
  assert.equal(page.controller.getState().complete, false); assert.ok(page.events.some(e => e.type === 'assistance' && e.detail.reason === 'seek')); assert.equal(page.events.some(e => e.type === 'complete' && e.value), false);
  page.controller.destroy();
});

test('muted or zero-volume portions are excluded from complete audible coverage', async () => {
  for (const muted of [true, false]) {
    const page = browser(); await page.controller.play(); page.advance(4);
    if (muted) page.audio.muted = true; else page.audio.volume = 0; page.audio.fire('volumechange'); page.advance(2);
    page.audio.muted = false; page.audio.volume = 1; page.audio.fire('volumechange'); page.advance(4); page.finish();
    assert.equal(page.controller.getState().complete, false); page.controller.destroy();
  }
});

test('assessment permits one successful playback and cannot be manually reloaded to replay a healthy completed file', async () => {
  const page = browser({ assessment: true }); assert.equal(page.audio.controls, false); await page.controller.play();
  assert.equal(page.playButton.disabled, true); await page.controller.play(); assert.equal(page.audio.plays, 1);
  page.advance(10); page.finish(); assert.equal(page.controller.getState().complete, true);
  assert.equal(await page.controller.reload(), false); assert.equal(page.audio.plays, 1); page.controller.destroy();
});

test('media error codes are explained specifically and explicit reload cache-busts the original local URL', async () => {
  for (const code of [1, 2, 3, 4]) {
    const page = browser({ assessment: true }); page.audio.error = { code }; page.audio.fire('error');
    assert.equal(page.controller.getState().error.code, 'MEDIA_' + code); assert.equal(page.controller.getState().available, false); assert.equal(page.controller.getState().complete, false); assert.equal(page.reloadButton.hidden, false);
    const original = page.audio.src; await page.controller.reload(); const retry = new URL(page.audio.src);
    assert.notEqual(page.audio.src, original); assert.equal(retry.origin, 'http://127.0.0.1:8765'); assert.equal(retry.pathname, '/audio/curriculum/w01-listen-1.mp3'); assert.ok(retry.searchParams.has('_ielts_audio_retry')); assert.equal(page.audio.loads, 1);
    assert.equal(page.controller.getState().available, true); assert.equal(page.audio.plays, 1); page.controller.destroy();
  }
});

test('network failure after some playback revokes available/complete flags and allows an assisted retry', async () => {
  const page = browser({ assessment: true }); await page.controller.play(); page.advance(2); page.audio.error = { code: 2 }; page.audio.fire('error');
  assert.ok(page.events.some(e => e.type === 'available' && e.value === false)); assert.ok(page.events.some(e => e.type === 'complete' && e.value === false)); assert.equal(page.controller.getState().complete, false);
  await page.controller.reload(); assert.equal(page.audio.plays, 2); assert.ok(page.events.some(e => e.type === 'assistance' && e.detail.reason === 'retry-after-partial')); assert.equal(page.controller.getState().coverage.coveredSeconds, 0);
  page.advance(10); page.finish(); assert.equal(page.controller.getState().complete, true); page.controller.destroy();
});

test('stalled network exposes explicit retry while a later playing event can recover without pretending it completed', async () => {
  const page = browser({ assessment: true }); await page.controller.play(); page.audio.fire('waiting'); page.audio.fire('stalled');
  assert.equal(page.reloadButton.hidden, false); assert.equal(page.controller.getState().complete, false);
  page.audio.fire('playing'); assert.equal(page.reloadButton.hidden, true); assert.equal(page.controller.getState().available, true); page.controller.destroy();
});

test('browser policy failures and disposed pending playback never create available or completed evidence', async () => {
  const denied = browser({ rejected: { name: 'NotAllowedError' } }); await denied.controller.play();
  assert.equal(denied.controller.getState().error.code, 'PLAY_NOT_ALLOWED'); assert.equal(denied.controller.getState().available, false); denied.controller.destroy();
  let release; const page = browser({ withheld: new Promise(resolve => { release = resolve; }) }), pending = page.controller.play();
  page.controller.destroy(); release(); await pending; assert.equal(page.events.some(e => e.type === 'available' && e.value), false); assert.equal(page.audio.src, ''); assert.equal(page.controller.getState().disposed, true);
});

test('course pause keeps actual coverage and resumes the same file through the normal play button',async()=>{
 for(const assessment of [false,true]){
  const page=browser({assessment});await page.controller.play();page.advance(4);const src=page.audio.src;page.controller.pause();assert.equal(page.controller.getState().phase,'paused');assert.equal(page.controller.getState().coverage.coveredSeconds,4);assert.equal(page.playButton.disabled,false);assert.equal(page.audio.paused,true);
  page.now+=20000;await page.controller.play();assert.equal(page.audio.src,src);assert.equal(page.audio.loads,0);page.advance(6);page.finish();assert.equal(page.controller.getState().complete,true);assert.equal(page.events.some(e=>e.type==='error'),false);page.controller.destroy();
 }
});

test('invalid sources explicitly revoke stale parent flags without fetching or pretending to play a fallback',async()=>{
 const page=browser({src:'https://foreign.example/recording.mp3'});assert.equal(page.playButton.disabled,true);assert.ok(page.events.some(e=>e.type==='available'&&e.value===false));assert.ok(page.events.some(e=>e.type==='complete'&&e.value===false));assert.equal(await page.controller.play(),false);assert.equal(page.audio.plays,0);assert.equal(page.controller.getState().error.code,'INVALID_SOURCE');page.controller.destroy();
});

test('native played evidence closes a 51.144-second background tail when final timeupdate already observes paused=true',async()=>{
 for(const assessment of [false,true]){
  const page=browser({assessment,nativePlayed:true});page.audio.duration=51.144;await page.controller.play();page.advance(51.144,false);
  page.audio.paused=true;page.audio.ended=true;page.audio.fire('timeupdate');page.audio.fire('pause');page.audio.fire('ended');
  const state=page.controller.getState();assert.equal(state.complete,true);assert.equal(state.coverage.coveredSeconds,51.144);assert.equal(state.coverage.jumps,0);assert.equal(page.events.some(e=>e.type==='assistance'),false);assert.match(page.status.textContent,/实际完整播放/);
  if(assessment){assert.equal(await page.controller.play(),false);assert.equal(await page.controller.reload(),false);assert.equal(page.audio.plays,1);}page.controller.destroy();
 }
});

test('a native coverage gap cannot be bridged by enough elapsed wall time or a single late ended event',async()=>{
 const page=browser({assessment:true,nativePlayed:true});await page.controller.play();page.advance(1);page.now+=9000;page.audio.currentTime=10;page.audio.nativeRanges=[[0,1],[9,10]];page.audio.paused=true;page.audio.ended=true;page.audio.fire('timeupdate');page.audio.fire('pause');page.audio.fire('ended');
 assert.equal(page.controller.getState().complete,false);assert.equal(page.controller.getState().coverage.coveredSeconds,2);assert.ok(page.events.some(e=>e.type==='assistance'&&e.detail.reason==='seek'));assert.equal(await page.controller.reload(),false);assert.equal(await page.controller.play(),false);assert.equal(page.audio.plays,1);page.controller.destroy();
});

test('explicit seek boundaries remain incomplete even when a background interval would make the wall-clock heuristic permissive',async()=>{
 const page=browser({nativePlayed:true});await page.controller.play();page.advance(1);page.now+=8000;page.audio.seeking=true;page.audio.currentTime=9;page.audio.fire('seeking');page.audio.seeking=false;page.audio.fire('seeked');page.advance(1,false);page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.controller.getState().complete,false);assert.equal(page.controller.getState().coverage.coveredSeconds,2);assert.ok(page.events.some(e=>e.type==='assistance'&&e.detail.reason==='seek'));page.controller.destroy();
});

test('native played history never turns muted or zero-volume background intervals into audible coverage',async()=>{
 for(const muted of [true,false]){
  const page=browser({nativePlayed:true});await page.controller.play();page.advance(4,false);if(muted)page.audio.muted=true;else page.audio.volume=0;page.audio.fire('volumechange');assert.equal(page.controller.getState().coverage.coveredSeconds,4);
  page.advance(2,false);page.audio.muted=false;page.audio.volume=1;page.audio.fire('volumechange');page.advance(4,false);page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.audio.played.length,1);assert.equal(page.audio.played.end(0),10);assert.equal(page.controller.getState().coverage.coveredSeconds,8);assert.equal(page.controller.getState().complete,false);
  // A genuine audible practice replay may recover the missing interval even
  // though the browser's union of played ranges no longer grows.
  page.audio.seeking=true;page.audio.currentTime=0;page.audio.fire('seeking');page.audio.seeking=false;page.audio.fire('seeked');await page.controller.play();page.audio.nativeRanges=[[0,10]];page.advance(10,false);page.audio.nativeRanges=[[0,10]];page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.controller.getState().complete,true);assert.ok(page.events.some(e=>e.type==='assistance'));page.controller.destroy();
 }
});

test('a sparse pause boundary preserves actual native playback and paused wall time adds no extra coverage',async()=>{
 for(const assessment of [false,true]){
  const page=browser({assessment,nativePlayed:true});await page.controller.play();page.advance(4,false);page.audio.paused=true;page.audio.fire('timeupdate');page.audio.fire('pause');assert.equal(page.controller.getState().coverage.coveredSeconds,4);page.now+=60000;page.audio.fire('timeupdate');assert.equal(page.controller.getState().coverage.coveredSeconds,4);
  await page.controller.play();page.advance(6,false);page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.controller.getState().complete,true);assert.equal(page.audio.loads,0);page.controller.destroy();
 }
});

test('rate boundaries use actual native positions, retain assistance and do not count buffering as audio',async()=>{
 const page=browser({nativePlayed:true});await page.controller.play();page.advance(2,false);page.audio.playbackRate=2;page.audio.fire('ratechange');assert.equal(page.controller.getState().coverage.coveredSeconds,2);page.audio.fire('waiting');page.now+=30000;page.audio.fire('timeupdate');assert.equal(page.controller.getState().coverage.coveredSeconds,2);page.audio.fire('playing');page.advance(8,false);page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.controller.getState().complete,true);assert.equal(page.controller.getState().coverage.coveredSeconds,10);assert.ok(page.events.some(e=>e.type==='assistance'&&e.detail.reason==='rate'));page.controller.destroy();
});

test('native played reads fail closed on malformed snapshots and reload clears old-source coverage',async()=>{
 const native=values=>({played:{length:values.length,start:i=>values[i][0],end:i=>values[i][1]}});assert.equal(player.playedRanges({}),null);assert.deepEqual(player.playedRanges(native([[0,1],[2,3]])),[[0,1],[2,3]]);for(const values of [[[0,NaN]],[[-1,1]],[[2,1]],[[0,3],[2,4]]])assert.deepEqual(player.playedRanges(native(values)),[]);assert.deepEqual(player.playedRanges({get played(){throw Error('unavailable');}}),[]);
 const page=browser({assessment:true,nativePlayed:true});await page.controller.play();page.advance(4,false);page.audio.error={code:2};page.audio.fire('error');await page.controller.reload();assert.equal(page.audio.nativeRanges.length,0);assert.equal(page.controller.getState().coverage.coveredSeconds,0);page.advance(10,false);page.audio.paused=true;page.audio.fire('timeupdate');page.finish();assert.equal(page.controller.getState().complete,true);page.controller.destroy();page.audio.fire('timeupdate');assert.equal(page.controller.getState().disposed,true);
});
