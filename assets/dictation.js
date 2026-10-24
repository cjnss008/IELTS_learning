(function (root) {
  'use strict';
  const normalize = text => String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/(\d),(?=\d)/g, '$1').match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  function compare(reference, answer) {
    const a = normalize(reference), b = normalize(answer);
    if (a.length > 500 || b.length > 500) throw Error('每次听写请控制在 500 词以内。');
    const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i ? j ? 0 : i : j));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1]));
    const diff = []; let i = a.length, j = b.length;
    while (i || j) {
      if (i && j && d[i][j] === d[i - 1][j - 1] + (a[i - 1] !== b[j - 1])) { diff.unshift({ type: a[i - 1] === b[j - 1] ? 'correct' : 'replace', expected: a[--i], actual: b[--j] }); }
      else if (i && d[i][j] === d[i - 1][j] + 1) diff.unshift({ type: 'missing', expected: a[--i], actual: '' });
      else diff.unshift({ type: 'extra', expected: '', actual: b[--j] });
    }
    return { score: a.length ? Math.round(Math.max(0, 1 - d[a.length][b.length] / a.length) * 100) : 0, errors: d[a.length][b.length], diff };
  }
  function sentences(groups) {
    const rows = [];
    for (const g of groups.slice(1)) {
      const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(g.text)].map(p => ({ text: p.segment, index: p.index })) : [...g.text.matchAll(/[^.!?]+[.!?]*/g)].map(p => ({ text: p[0], index: p.index }));
      for (const part of parts) {
        const words = g.words.filter(w => w.toChar > part.index && w.fromChar < part.index + part.text.length);
        if (words.length) rows.push({ id: `${g.index}-${rows.length}`, text: part.text.trim(), start: Math.max(g.start, g.start + words[0].start - .07), end: Math.min(g.voiceEnd, g.start + words.at(-1).end + .15), paragraph: g.index });
      }
    }
    return rows;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function mount(host, lesson, groups) {
    const rows = sentences(groups); let index = 0, revealed = false, records = {}, blocked = false, request = 0;
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    const storage = root.IELTSProfiles ? root.IELTSProfiles.storage() : preview ? sessionStorage : localStorage;
    const key = `ielts52-dictation${preview ? '-preview' : ''}-v1`;
    let raw = null; const evidenceAttempts = new Map();
    function evidence(){const id=rows[index].id;if(!evidenceAttempts.has(id)&&root.IELTSLearningBridge)evidenceAttempts.set(id,root.IELTSLearningBridge.create({materialId:"dictation-"+lesson.day+"-"+id,materialVersion:"1",title:"第"+lesson.day+"篇第"+(index+1)+"句听写",skill:"listening",taskId:"listening",source:"dictation",unit:"题",assisted:revealed,mistakeQuestion:{id:"dictation-"+lesson.day+"-"+id,type:"dictation",prompt:"听写第"+lesson.day+"篇第"+(index+1)+"句（忽略大小写与标点，所有词须准确）",answers:[rows[index].text],explanation:"逐词核对漏词、多词与拼写；完整写对原句后再重测。",evidence:rows[index].text}}));return evidenceAttempts.get(id);}
    try { raw = storage.getItem(key); records = raw ? JSON.parse(raw) : {}; if (!records || typeof records !== 'object' || Array.isArray(records)) throw Error(); }
    catch { blocked = true; }
    host.innerHTML = `<h2>逐句听写 · 听清再写</h2><p class="small">按现有词级时间点切分慢速音频。先盲听，再核对遗漏、拼写和多写的词；差异分仅用于本句练习。片段边界若不自然，可回到原段重听。</p><div class="toolbar"><button data-d="prev">上一句</button><span data-d="position"></span><button data-d="next">下一句</button><button data-d="weak">下一条错句</button></div><audio data-d="audio" preload="metadata" src="audio/Day${String(lesson.day).padStart(2, '0')}_slow.mp3"></audio><div class="toolbar"><button class="primary" data-d="play">播放本句</button><button data-d="stop">停止</button><label>播放速度 <select data-d="speed"><option value="1">原慢速</option><option value="0.85">更慢</option><option value="1.25">加快</option></select></label><button data-d="hint">显示首字母提示</button></div><p data-d="hintText" lang="en"></p><label>写下听到的句子<textarea data-d="answer" maxlength="4000" spellcheck="false" autocomplete="off"></textarea></label><div class="toolbar"><button data-d="check" class="primary">提交并核对</button><button data-d="reveal">查看原句</button><button data-d="retry">重新闭卷尝试</button></div><p data-d="result" role="status"></p><div data-d="diff" class="dictation-diff" lang="en"></div><p data-d="reference" lang="en" hidden></p><p class="small" data-d="save"></p>`;
    const el = name => host.querySelector(`[data-d="${name}"]`), audio = el('audio');
    function stop() { request++; audio.pause(); }
    function save(exposed = false) {
      if (blocked) { el('save').textContent = '旧记录格式无法读取，已保留原数据；本次不会覆盖，请到备份中心导出。'; return; }
      try {
        const latest = storage.getItem(key);
        if (latest !== raw) { records = latest ? JSON.parse(latest) : {}; if (!records || typeof records !== 'object' || Array.isArray(records)) throw Error(); }
        records[`${lesson.day}:${rows[index].id}`] = { answer: el('answer').value, assisted: revealed, exposed: exposed === true, at: new Date().toISOString() };
        raw = JSON.stringify(records); storage.setItem(key, raw); el('save').textContent = preview ? '预览记录已保存' : '听写草稿已保存到当前浏览器，可在备份中心导出。';
      } catch { el('save').textContent = '保存失败，请先复制本句答案。'; }
    }
    function render() {
      stop(); const r = records[`${lesson.day}:${rows[index].id}`]; revealed = Boolean(r?.assisted || r?.exposed);
      el('position').textContent = `第 ${index + 1} / ${rows.length} 句 · 段落 ${rows[index].paragraph}`;
      el('answer').value = typeof r?.answer === 'string' ? r.answer.slice(0, 4000) : '';
      el('prev').disabled = index === 0; el('next').disabled = index === rows.length - 1;
      el('reference').hidden = true; el('reference').textContent = rows[index].text; evidence();
      el('hintText').textContent = ''; el('result').textContent = ''; el('diff').innerHTML = '';
      if (blocked) el('save').textContent = '已有记录无法读取，当前不会覆盖。请使用备份中心保存原始数据。';
    }
    audio.addEventListener('timeupdate', () => { if (audio.currentTime >= rows[index].end) audio.pause(); });
    el('play').onclick = async () => {
      const ticket = ++request; el('result').textContent = '正在准备音频…';
      try {
        document.querySelectorAll('audio').forEach(a => a.pause());
        if (audio.readyState < 1) await new Promise((resolve, reject) => { const timer = setTimeout(() => done(Error()), 10000); function done(e) { clearTimeout(timer); audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail); e ? reject(e) : resolve(); } const ok = () => done(), fail = () => done(Error()); audio.addEventListener('loadedmetadata', ok, { once: true }); audio.addEventListener('error', fail, { once: true }); audio.load(); });
        if (ticket !== request || !host.isConnected) return;
        audio.currentTime = rows[index].start; audio.playbackRate = Number(el('speed').value); await audio.play(); el('result').textContent = '播放到本句末自动停止，可重复播放。';
      } catch { el('result').textContent = '音频暂时无法播放，请检查 audio 文件夹并重新点击。'; }
    };
    el('stop').onclick = stop;
    el('prev').onclick = () => { if (index > 0) { index--; render(); } };
    el('next').onclick = () => { if (index < rows.length - 1) { index++; render(); } };
    el('weak').onclick = () => { const next = rows.map((_, k) => (index + k + 1) % rows.length).find(k => { const r = records[`${lesson.day}:${rows[k].id}`]; if (!r?.answer) return false; try { return compare(rows[k].text, r.answer).score < 90 || r.assisted; } catch { return true; } }); if (next === undefined) el('result').textContent = '没有已作答的错句。先完成听写；看过提示的句子也会安排重练。'; else { index = next; render(); } };
    el('answer').oninput = save;
    el('retry').onclick = () => { stop(); revealed = false; el('answer').value = ''; el('reference').hidden = true; el('hintText').textContent = ''; el('diff').innerHTML = ''; el('result').textContent = '新的闭卷尝试已开始。建议间隔一天后再独立听写，不回看原句。'; save(); };
    el('hint').onclick = () => { evidence()?.expose(); revealed = true; el('hintText').textContent = normalize(rows[index].text).map(w => w[0] + '_'.repeat(Math.min(12, w.length - 1))).join(' '); save(); };
    el('reveal').onclick = () => { evidence()?.expose(); revealed = true; el('reference').hidden = false; save(); };
    el('check').onclick = () => {
      if (!el('answer').value.trim()) { el('result').textContent = '请先独立写下答案。'; return; }
      try { const result = compare(rows[index].text, el('answer').value); const attempt=evidence(); if(attempt)root.IELTSLearningBridge.report(attempt.submit({answer:el('answer').value,score:result.score,maxScore:100,threshold:1,assisted:revealed,feedback:result.errors+'处词级差异；文字匹配练习，不换算Band。'}),el('result')); el('result').textContent = `本句文字准确率 ${result.score}% · ${result.errors} 处词级差异${revealed ? ' · 使用过提示，请隔天闭卷重试' : ''}。忽略大小写和标点，不换算雅思听力分。`; el('diff').innerHTML = result.diff.map(d => `<span class="diff-${d.type}">${d.type === 'correct' ? esc(d.actual) : d.type === 'missing' ? '漏：' + esc(d.expected) : d.type === 'extra' ? '多：' + esc(d.actual) : esc(d.actual) + ' → ' + esc(d.expected)}</span>`).join(' '); save(true); revealed = true; } catch (e) { el('result').textContent = e.message; }
    };
    render(); return stop;
  }
  const api = { normalize, compare, sentences, mount };
  root.IELTSDictation = api; if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
