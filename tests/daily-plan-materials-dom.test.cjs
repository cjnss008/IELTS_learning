'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../assets/daily-plan-core.js');
const Store = require('../assets/daily-plan-state.js');
const curriculum = require('../assets/curriculum-data.js');
const mapping = require('../materials/textbook-training-map.json');
require('../assets/daily-plan-content.js');

class Element {
  constructor(id = '') {
    this.id = id; this.value = ''; this.textContent = ''; this.hidden = false; this.listeners = {}; this.cards = new Map(); this.parts = new Map();
    this.classList = { toggle() {} };
  }
  set innerHTML(value) {
    this.html = value;
    if (this.id === 'taskList') this.cards = new Map([...value.matchAll(/data-task="([^"]+)"/g)].map(m => [m[1], new Element()]));
  }
  get innerHTML() { return this.html || ''; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  fire(name) { for (const listener of this.listeners[name] || []) listener({ target: this, preventDefault() {} }); }
  querySelectorAll() { return []; }
  querySelector(selector) {
    const task = /^\[data-task="([^"]+)"\]$/.exec(selector);
    if (task) return this.cards.get(task[1]);
    if (selector === '.linked-task') return this.linked || null;
    if (!this.parts.has(selector)) { const part = new Element(); part.after = node => { this.linked = node; }; this.parts.set(selector, part); }
    return this.parts.get(selector);
  }
  replaceChildren() {}
  insertAdjacentHTML() {}
}

function fixture() {
  const html = fs.readFileSync(path.join(__dirname, '../每日学习计划.html'), 'utf8');
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const storage = new Map();
  const context = {
    IELTSPlanCore: Core, IELTSPlanState: Store, IELTSPlanContent: global.IELTSPlanContent, IELTSCurriculumData: curriculum,
    IELTSRecords: { EVENT: 'records', list: async () => [], summaries: () => ({}) },
    IELTSProfiles: { mount() {}, storage: () => ({ getItem: key => storage.get(key) ?? null, setItem: (key, raw) => storage.set(key, raw) }), scopeKey: key => key },
    document: { getElementById: id => nodes.get(id), createElement: () => new Element(), querySelectorAll: () => [] },
    location: { search: '?preview=1', hash: '#day1' }, URLSearchParams, Map, Set, console,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-24T12:00:00.000Z'])); } },
    setTimeout: () => 1, clearTimeout() {}, addEventListener() {}
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/daily-plan-app.js'), 'utf8'), context);
  return { nodes, selectWeek: week => { nodes.get('weekSelect').value = String(week); nodes.get('weekSelect').fire('change'); } };
}

function links(html) {
  const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({ attributes: m[1], href: decode(/href="([^"]+)"/.exec(m[1])[1]), text: decode(m[2]) }));
}

test('日程实际渲染每周泛读泛听指定材料，明确使用原时段且不计陌生测评', () => {
  const f = fixture(), byId = new Map(curriculum.materials.map(material => [material.id, material]));
  for (let week = 1; week <= 52; week++) {
    f.selectWeek(week);
    const html = f.nodes.get('materials').innerHTML, source = curriculum.weeks.find(row => row.week === week);
    assert.match(html, /泛读、泛听包含在原阅读、听力时段内，不另加时间/);
    assert.match(html, /已见材料只作流畅度练习，不计陌生测评/);
    assert.equal(f.nodes.get('dayMinutes').textContent, 360);
    for (const skill of ['reading', 'listening']) {
      const section = new RegExp('<section class="extensive-materials" data-skill="' + skill + '">([\\s\\S]*?)</section>').exec(html);
      assert.ok(section, week + ':' + skill);
      const actual = links(section[1]);
      assert.deepEqual(actual.map(link => new URL(link.href, 'http://127.0.0.1:8765/').searchParams.get('material')), source.extensive[skill + 'Ids']);
      for (const link of actual) {
        const url = new URL(link.href, 'http://127.0.0.1:8765/'), material = byId.get(url.searchParams.get('material'));
        assert.equal(material.skill, skill);
        assert.equal(material.pool, 'training');
        assert.equal(material.fullTest, false);
        assert.equal(link.text, material.title + ' →');
        assert.equal(url.searchParams.get('day'), String((week - 1) * 7 + 1));
        assert.equal(url.searchParams.get('mode'), 'practice');
        assert.equal(url.searchParams.get('activity'), 'extensive');
        assert.equal(url.searchParams.get('preview'), '1');
      }
    }
  }
});

test('第21–52周教材入口逐周对应training-map，仅进入索引并保留末期卷', () => {
  const f = fixture();
  f.selectWeek(20);
  assert.doesNotMatch(f.nodes.get('materials').innerHTML, /data-textbook-week/);
  for (const row of mapping.recommendations) {
    f.selectWeek(row.week);
    const html = f.nodes.get('materials').innerHTML;
    const link = links(html).find(item => item.attributes.includes('data-textbook-week="' + row.week + '"'));
    assert.ok(link, '第 ' + row.week + ' 周教材入口');
    const [, edition, number] = /^cambridge-(\d+)-test-(\d+)$/.exec(row.testId), url = new URL(link.href, 'http://127.0.0.1:8765/');
    assert.equal(decodeURIComponent(url.pathname), '/本地教材.html');
    assert.equal(url.searchParams.get('edition'), edition);
    assert.equal(url.searchParams.get('type'), 'exam');
    assert.equal(url.searchParams.get('preview'), '1');
    assert.ok(link.text.includes('剑桥 ' + edition + ' · Test ' + number));
    assert.match(html, /进入索引不会登记曝光；点击 PDF 才登记/);
    if (row.role === 'reserved-unseen-assessment') {
      assert.match(link.text, /末期保留/);
      assert.match(html, /先在教材库检查是否已见，准备使用时再展开保留卷/);
    }
    assert.ok(links(html).every(item => !/\.pdf(?:[#?]|$)/i.test(item.href)), '日程不得直接打开教材 PDF');
    assert.equal(f.nodes.get('dayMinutes').textContent, 360);
  }
});
