// ============== 状态 ==============
const state = { images: [], aggregated: null, chart: null, standardized: null, history: [] };

// ============== JSONBin.io 存储 ==============
{
  const kEl = document.getElementById('jsonbinKey');
  const iEl = document.getElementById('jsonbinId');
  const savedK = localStorage.getItem('styledna_jsonbinKey');
  const savedI = localStorage.getItem('styledna_jsonbinId');
  if (savedK) kEl.value = savedK;
  if (savedI) iEl.value = savedI;
  kEl.addEventListener('change', () => { localStorage.setItem('styledna_jsonbinKey', kEl.value); });
  iEl.addEventListener('change', () => { localStorage.setItem('styledna_jsonbinId', iEl.value); });
}

/** 获取或创建 Bin ID */
async function getOrCreateBinId() {
  let binId = document.getElementById('jsonbinId').value.trim();
  if (binId) return binId;
  // 创建新 Bin
  const key = document.getElementById('jsonbinKey').value.trim();
  if (!key) return null;
  try {
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': key, 'X-Bin-Name': 'style-dna-history' },
      body: JSON.stringify({ records: [] })
    });
    if (!res.ok) throw new Error(`创建Bin失败 HTTP ${res.status}`);
    const data = await res.json();
    binId = data.metadata.id;
    document.getElementById('jsonbinId').value = binId;
    localStorage.setItem('styledna_jsonbinId', binId);
    toast(`✅ 已创建新存储空间: ${binId}`);
    return binId;
  } catch (e) {
    console.warn('[JSONBin] 创建失败:', e.message);
    return null;
  }
}

/** 保存分析结果到 JSONBin */
async function saveToJSONBin(analysisData) {
  const key = document.getElementById('jsonbinKey').value.trim();
  if (!key) return; // 未配置则跳过
  try {
    const binId = await getOrCreateBinId();
    if (!binId) return;
    // 先读取现有数据
    let existing = { records: [] };
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: { 'X-Master-Key': key }
      });
      if (res.ok) existing = (await res.json()).record || existing;
    } catch (e) { /* 首次使用可能为空 */ }
    // 追加新记录（最多保留50条）
    const record = {
      id: uid(),
      timestamp: new Date().toISOString(),
      imageCount: analysisData.imageCount,
      coreStyle: analysisData.coreStyle,
      summary: analysisData.summary || '',
      keywords: analysisData.keywords || [],
      formula: analysisData.formula,
      standardized: analysisData.standardized ? serializeForStorage(analysisData.standardized) : null,
      aggregated: analysisData.aggregated
    };
    existing.records.unshift(record);
    if (existing.records.length > 50) existing.records = existing.records.slice(0, 50);
    // 写回
    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
      body: JSON.stringify(existing)
    });
    if (!putRes.ok) throw new Error(`保存失败 HTTP ${putRes.status}`);
    toast(`☁️ 结果已保存到云端`);
    state.history = existing.records;
    renderHistory();
  } catch (e) {
    console.warn('[JSONBin] 保存失败:', e.message);
    toast(`⚠️ 云存储保存失败: ${e.message.slice(0,60)}`);
  }
}

/** 从 JSONBin 加载历史 */
async function loadFromJSONBin() {
  const key = document.getElementById('jsonbinKey').value.trim();
  const binId = document.getElementById('jsonbinId').value.trim();
  if (!key || !binId) return;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': key }
    });
    if (!res.ok) throw new Error(`加载失败 HTTP ${res.status}`);
    const data = await res.json();
    state.history = (data.record?.records || data.record || []);
    if (!Array.isArray(state.history)) state.history = [];
    renderHistory();
  } catch (e) {
    console.warn('[JSONBin] 加载失败:', e.message);
  }
}

/** 序列化标准化结果（去除不可序列化数据） */
function serializeForStorage(std) {
  const copy = JSON.parse(JSON.stringify(std));
  return copy;
}

// ============== 历史记录 UI ==============
function renderHistory() {
  const dropdown = document.getElementById('historyDropdown');
  if (!dropdown) return;
  
  if (!state.history || !state.history.length) {
    dropdown.innerHTML = '<div class="history-empty">暂无历史记录</div>';
    return;
  }
  const html = state.history.map(r => {
    const date = new Date(r.timestamp).toLocaleString('zh-CN');
    return `<div class="history-item" data-id="${r.id}">
      <div class="history-title">${r.coreStyle || '未知风格'}<span class="history-time">${date}</span></div>
      <div class="history-info">📸 ${r.imageCount} 张图片 ${r.keywords && r.keywords.length ? '· ' + r.keywords.slice(0,3).join(' · ') : ''}</div>
      ${r.summary ? `<div class="history-preview">${r.summary.slice(0, 80)}${r.summary.length > 80 ? '...' : ''}</div>` : ''}
    </div>`;
  }).join('');
  dropdown.innerHTML = html;
}

// 下拉菜单交互
document.getElementById('historyBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdownContainer = document.getElementById('historyDropdownContainer');
  const btn = e.target;
  const btnRect = btn.getBoundingClientRect();
  
  // 设置下拉菜单位置
  const dropdownContent = document.querySelector('.history-dropdown-content');
  dropdownContent.style.top = `${btnRect.bottom + 6}px`;
  dropdownContent.style.right = `${window.innerWidth - btnRect.right}px`;
  
  dropdownContainer.classList.toggle('active');
});

// 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
  const dropdownContainer = document.getElementById('historyDropdownContainer');
  const historyBtn = document.getElementById('historyBtn');
  if (historyBtn && !historyBtn.contains(e.target)) {
    dropdownContainer.classList.remove('active');
  }
});

// 点击历史记录项
document.getElementById('historyDropdown')?.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (item) {
    const id = item.dataset.id;
    loadHistoryRecord(id);
    document.getElementById('historyDropdownContainer').classList.remove('active');
  }
});

/** 加载并展示某条历史记录 */
window.loadHistoryRecord = async function(id) {
  const rec = state.history.find(r => r.id === id);
  if (!rec) return toast('记录不存在');
  try {
    // 恢复聚合数据并渲染
    if (rec.aggregated) {
      state.aggregated = rec.aggregated;
      document.getElementById('emptyCard').style.display = 'none';
      document.getElementById('resultCard').style.display = 'block';
      renderResult(state.aggregated);
      // 如果有标准化结果也恢复
      if (rec.standardized) {
        state.standardized = rec.standardized;
        renderStandardizedFormula(state.standardized);
        if (rec.summary) renderConclusion(rec.summary, rec.keywords || []);
      }
      // 切换到汇总Tab
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'summary'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-summary'));
      toast('✅ 已加载历史记录');
    }
  } catch (e) {
    toast('⚠️ 加载失败: ' + e.message.slice(0, 80));
  }
};

/** 删除某条历史记录 */
window.deleteHistoryRecord = async function(id) {
  if (!confirm('确定删除这条记录？')) return;
  const key = document.getElementById('jsonbinKey').value.trim();
  const binId = document.getElementById('jsonbinId').value.trim();
  state.history = state.history.filter(r => r.id !== id);
  renderHistory();
  // 同步到云端
  if (key && binId) {
    try {
      await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
        body: JSON.stringify({ records: state.history })
      });
    } catch (e) { console.warn('[删除同步失败]', e); }
  }
};

// ============== localStorage（只持久化 apiKey，其它字段已在HTML锁定） ==============
{
  const el = document.getElementById('apiKey');
  const saved = localStorage.getItem('styledna_apiKey');
  if (saved) el.value = saved;
  el.addEventListener('change', () => localStorage.setItem('styledna_apiKey', el.value));
}

// ============== 工具 ==============
function uid() { return Math.random().toString(36).slice(2, 9); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

async function compressImage(file) {
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const max = 1024;
  let { width, height } = img;
  if (width > max || height > max) {
    const r = width > height ? max/width : max/height;
    width = Math.round(width*r); height = Math.round(height*r);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ============== 上传 ==============
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
drop.addEventListener('click', () => fileInput.click());
['dragenter','dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', ev => handleFiles(ev.dataTransfer.files));
fileInput.addEventListener('change', ev => handleFiles(ev.target.files));

async function handleFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const dataUrl = await compressImage(f);
    state.images.push({ id: uid(), file: f, dataUrl, status: 'pending', result: null, error: null });
  }
  renderThumbs();
}

function renderThumbs() {
  const wrap = document.getElementById('thumbs');
  wrap.innerHTML = '';
  state.images.forEach(img => {
    const div = document.createElement('div');
    div.className = 'thumb';
    const label = ({pending:'待分析',running:'分析中',done:'完成',err:'失败'})[img.status];
    div.innerHTML = `<img src="${img.dataUrl}" />
      <span class="status ${img.status}">${label}</span>
      <button class="del" data-id="${img.id}">×</button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('.del').forEach(b => b.addEventListener('click', e => {
    state.images = state.images.filter(i => i.id !== e.target.dataset.id);
    renderThumbs();
  }));
  document.getElementById('analyzeBtn').disabled = state.images.length === 0;
}

document.getElementById('clearBtn').addEventListener('click', () => {
  state.images = []; state.aggregated = null; state.standardized = null;
  renderThumbs();
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('emptyCard').style.display = 'block';
  if (state.chart) { state.chart.destroy(); state.chart = null; }
});

// ============== 分组：把维度按 group 切片 ==============
function getGroupedDimensions() {
  const map = {};
  for (const d of STYLE_DIMENSIONS) {
    (map[d.group] ||= []).push(d);
  }
  // 返回有序数组：[{group, dims:[...]}...]
  return Object.entries(map).map(([group, dims]) => ({ group, dims }));
}

// ============== Prompt（按组生成，更聚焦） ==============
function buildPromptForGroup(group, dims) {
  // 构建维度文本（区分普通维度和分层维度）
  const dimsText = dims.map(d => {
    if (d.layered) {
      // 分层维度：先展示大类列表，再展示每个大类下的细分
      const catLines = d.categories.map(c =>
        `    - ${c.name}(${c.key}): [${d.subStyles[c.key].join(' | ')}]`
      ).join('\n');
      return `- ${d.key} (${d.label})【分层维度，先选大类再选细分】\n  大类选项: [${d.categories.map(c => c.name).join(' | ')}]\n  各大类对应细分:\n${catLines}`;
    }
    return `- ${d.key} (${d.label}): [${d.values.join(' | ')}]`;
  }).join('\n');

  // 判断本组是否包含分层维度
  const hasLayered = dims.some(d => d.layered);

  // 给不同组加一点"专家视角"提示，引导模型聚焦
  const expertHints = {
    '妆容': '请像专业化妆师一样观察人物面部细节（唇色、眉形、底妆质感、眼妆风格）。',
    '发型': '请像专业发型师一样观察整体发型轮廓、发色冷暖、刘海形态。',
    '穿搭': '请像时尚买手一样判断服装的整体风格归属、色彩搭配、面料和露肤情况。对于服装风格维度，请先确定风格大类，再从该大类中选择最精确的细分标签。',
    '配饰': '请聚焦人物身上佩戴的装饰品（不是衣物本身），找出最吸睛的核心配饰。',
    '氛围': '请像摄影师一样观察画面的光影、色调、场景、人物表情与构图，而非穿着。'
  };
  const hint = expertHints[group] || '';

  // 分层维度的额外规则
  const layeredRule = hasLayered ? `
6. 对于分层维度（如服装风格）：必须同时输出 category（大类key）和 value（细分值）
   例如: "category": "asian_clean", "value": "韩系Clean Fit"
   大类和细分必须严格来自给定枚举库，不能跨大类选择` : '';

  // 分层维度的 JSON Schema 示例
  const layeredSchemaExample = hasLayered ? `
对于分层维度:
    "<layered_key>": {
      "visible": true,
      "category": "<大类key>",
      "value": "<细分枚举值>",
      "confidence": 0.0,
      "reason": "<15字以内的视觉线索>"
    }` : '';

  return `你是专业的视觉风格分析师，本次只聚焦【${group}】方向。${hint}
请针对下列 ${dims.length} 个维度，对图片做"硬标签"判断——每个维度只输出 1 个最匹配的标签（不是分布）。

【硬性规则】
1. 每个维度只选 1 个最匹配的 value，必须严格来自给定枚举（不要发明新词、不要返回多个）
2. 如果该维度从图片完全看不出（例如全身穿搭题但图片只有大头），把 visible 设为 false，value 留空字符串
3. confidence ∈ [0,1] 表示你对该判断的把握；模糊场景请如实给低分，不要为了答题硬给高置信
4. reason 用 15 字以内描述做出该判断的关键视觉线索（如"深色眼影+小烟熏+高光"）
5. 必须输出严格的 JSON，不要任何解释文字、不要 markdown 代码块、不要注释${layeredRule}

【本组维度与枚举库】
${dimsText}

【输出 JSON Schema】（只输出本组的 ${dims.length} 个 key）
{
  "dimensions": {
    "<key>": {
      "visible": true,
      "value": "<枚举值>",
      "confidence": 0.0,
      "reason": "<15字以内的视觉线索>"
    }${layeredSchemaExample}
  }
}

只返回 JSON 对象本身。`;
}

// ============== 调 VLM（按组调，每次只问一组维度） ==============
async function callVLMForGroup(image, group, dims) {
  const apiBase = document.getElementById('apiBase').value.trim().replace(/\/+$/,'');
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value.trim();
  const protocol = document.getElementById('apiProtocol')?.value || 'chat';
  if (!apiKey) throw new Error('请填写 API Key');

  const promptText = buildPromptForGroup(group, dims);
  let url, body, parseContent;

  if (protocol === 'responses') {
    url = `${apiBase}/responses`;
    body = {
      model,
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: image.dataUrl },
          { type: 'input_text',  text: promptText }
        ]
      }]
    };
    parseContent = (data) => {
      if (typeof data.output_text === 'string') return data.output_text;
      if (Array.isArray(data.output)) {
        for (const item of data.output) {
          const c = item.content;
          if (Array.isArray(c)) {
            for (const seg of c) {
              if (typeof seg.text === 'string') return seg.text;
              if (seg.type === 'output_text' && seg.text) return seg.text;
            }
          }
        }
      }
      return JSON.stringify(data);
    };
  } else {
    url = `${apiBase}/chat/completions`;
    body = {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: image.dataUrl } }
        ]
      }],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    };
    parseContent = (data) => data.choices?.[0]?.message?.content || '';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`[${group}] HTTP ${res.status}: ${t.slice(0,200)}`);
  }
  const data = await res.json();
  const content = parseContent(data) || '';
  const cleaned = content.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  try { return JSON.parse(cleaned); }
  catch (e) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`[${group}] 模型返回非JSON：` + cleaned.slice(0,150));
  }
}

// ============== 单图全维度分析（5 组并行） ==============
async function analyzeImage(image) {
  const grouped = getGroupedDimensions();
  // 5 组并行调用，各自只问自己组的维度
  const settled = await Promise.allSettled(
    grouped.map(({ group, dims }) => callVLMForGroup(image, group, dims))
  );

  // 合并 dimensions
  const merged = { dimensions: {} };
  const failedGroups = [];
  settled.forEach((r, idx) => {
    const { group } = grouped[idx];
    if (r.status === 'fulfilled') {
      const dims = r.value?.dimensions || {};
      Object.assign(merged.dimensions, dims);
    } else {
      failedGroups.push(`${group}:${(r.reason?.message || r.reason || '').toString().slice(0,80)}`);
    }
  });

  // 只要不是全部失败就算成功；记录部分失败信息到 image.partialError
  if (failedGroups.length === grouped.length) {
    throw new Error('全部分组失败：' + failedGroups.join(' | '));
  }
  if (failedGroups.length > 0) {
    image.partialError = failedGroups.join(' | ');
  }
  return merged;
}

// ============== 并发控制 ==============
async function runWithConcurrency(items, limit, worker, onProgress) {
  let idx = 0, done = 0;
  const total = items.length;
  async function next() {
    while (idx < items.length) {
      const my = idx++;
      try { await worker(items[my]); }
      catch(e) { items[my].status = 'err'; items[my].error = e.message; }
      done++; onProgress?.(done, total); renderThumbs();
    }
  }
  const workers = Array.from({length: Math.min(limit, items.length)}, () => next());
  await Promise.all(workers);
}

// ============== 聚合（基于单图 top1 标签 + 置信度加权） ==============
function aggregate(images) {
  const result = {};
  for (const dim of STYLE_DIMENSIONS) {
    const acc = {}; // value -> sum(confidence)
    const catAcc = {}; // category -> sum(confidence), 仅用于分层维度
    let totalConf = 0, visibleCount = 0;
    const samples = [];
    for (const img of images) {
      if (img.status !== 'done') continue;
      const d = img.result?.dimensions?.[dim.key];
      if (!d || d.visible === false || !d.value) continue;
      const conf = Number(d.confidence) || 0.5;
      visibleCount++;
      totalConf += conf;
      acc[d.value] = (acc[d.value] || 0) + conf;
      samples.push({ value: d.value, confidence: conf, reason: d.reason || '', category: d.category || null });
      if (dim.layered && d.category) {
        catAcc[d.category] = (catAcc[d.category] || 0) + conf;
      }
    }
    const total = Object.values(acc).reduce((a,b)=>a+b,0);
    const distribution = total > 0
      ? Object.entries(acc).map(([value,w]) => ({value, weight: w/total})).sort((a,b)=>b.weight-a.weight)
      : [];
    const catTotal = Object.values(catAcc).reduce((a,b)=>a+b,0);
    const catDist = dim.layered && catTotal > 0
      ? Object.entries(catAcc).map(([k,w]) => ({
          categoryKey: k,
          categoryName: (dim.categories.find(c=>c.key===k)||{}).name||k,
          weight: w/catTotal
        })).sort((a,b)=>b.weight-a.weight)
      : [];
    result[dim.key] = {
      label: dim.label, group: dim.group,
      layered: !!dim.layered,
      visibleCount, avgConfidence: visibleCount ? totalConf/visibleCount : 0,
      distribution,
      categoryDistribution: catDist,
      samples
    };
  }
  return result;
}

// ============== 预定义维度级别覆盖表 ==============
const DIMENSION_CLASS_OVERRIDE = {
  'makeup_style':  'A', 'lip_style': 'A', 'base_texture': 'A', 'brow_style':    'A',
  'hair_color':    'A', 'color_tone':  'A', 'filter_tone':   'A',
  'top_type':      'C', 'bottom_type': 'C', 'accessory':     'C'
};

// ============== 标准化聚合：集中度计算 ==============
function calcConcentration(distribution) {
  if (!distribution.length) return { top1: 0, entropy: 0 };
  const top1 = distribution[0].weight;
  let entropy = 0;
  for (const d of distribution) {
    if (d.weight > 0) entropy -= d.weight * Math.log2(d.weight);
  }
  const maxEntropy = Math.log2(distribution.length);
  return { top1, entropy: maxEntropy > 0 ? entropy / maxEntropy : 0 };
}

// ============== 标准化聚合：分级判定 ==============
function classifyDimension(concentration, visibleCount) {
  const { top1, entropy } = concentration;
  if (visibleCount < 3)
    return { level: 'A', label: 'core', reason: `样本不足(${visibleCount}张)，默认核心特征`, confidence: 'low' };
  if (top1 >= 0.55 && entropy < 0.5)
    return { level: 'A', label: 'core', reason: `高度集中 top1=${(top1*100).toFixed(0)}%`, confidence: 'high' };
  if (top1 >= 0.35 && entropy < 0.75)
    return { level: 'B', label: 'variant', reason: `有限变体 top1=${(top1*100).toFixed(0)}%`, confidence: 'medium' };
  return { level: 'C', label: 'scattered', reason: `离散分布 top1=${(top1*100).toFixed(0)}%, 熵=${entropy.toFixed(2)}`, confidence: 'low' };
}

function finalClassification(dimKey, autoResult) {
  const forced = DIMENSION_CLASS_OVERRIDE[dimKey];
  if (forced)
    return { ...autoResult, level: forced, label: forced === 'A' ? 'core' : forced === 'B' ? 'variant' : 'scattered', reason: autoResult.reason + ' [预定义]' };
  return autoResult;
}

// ============== A类策略：Top1 单值 ==============
function aggregateClassA(dimKey, dimLabel, aggData) {
  const d = aggData[dimKey];
  if (!d || !Array.isArray(d.distribution) || !d.distribution.length)
    return { dimension: dimKey, label: dimLabel, level: 'A', displayMode: 'single', consensus: '-', confidence: 0, support: '0张', avgConfidence: 0, rawDistribution: [], samples: [] };
  const top = d.distribution[0];
  return {
    dimension: dimKey, label: dimLabel, level: 'A', displayMode: 'single',
    consensus: top.value,
    confidence: top.weight,
    support: `${d.visibleCount}张`,
    avgConfidence: d.avgConfidence,
    rawDistribution: d.distribution,
    samples: d.samples
  };
}

// ============== B类策略：Top-N 集合 ==============
function aggregateClassB(dimKey, dimLabel, aggData, threshold) {
  if (threshold === undefined) threshold = 0.80;
  const d = aggData[dimKey];
  if (!d || !Array.isArray(d.distribution) || !d.distribution.length)
    return { dimension: dimKey, label: dimLabel, level: 'B', displayMode: 'multi', primary: '', primaryWeight: 0, consensus: [], alternatives: [], cumulative: 0, support: '0张', rawDistribution: [], samples: [] };
  let cumul = 0;
  const selected = [];
  for (const item of d.distribution) {
    selected.push({ value: item.value, weight: item.weight });
    cumul += item.weight;
    if (cumul >= threshold || selected.length >= 5) break;
  }
  return {
    dimension: dimKey, label: dimLabel, level: 'B', displayMode: 'multi',
    primary: selected[0]?.value || '',
    primaryWeight: selected[0]?.weight || 0,
    consensus: selected.map(s => s.value),
    alternatives: selected.map(s => ({ value: s.value, weight: s.weight, pct: `${(s.weight*100).toFixed(0)}%` })),
    cumulative: Math.min(cumul, 1),
    support: `${d.visibleCount}张`,
    rawDistribution: d.distribution,
    samples: d.samples
  };
}

// ============== C类策略：LLM 语义归纳 ==============
function getAllSubStyleValues(dim) {
  if (!dim.layered || !dim.subStyles) return dim.values || [];
  const all = [];
  for (const subs of Object.values(dim.subStyles)) all.push(...subs);
  return all;
}

function buildScatteredDimPrompt(dimKey, dimLabel, distribution, allValues, imageCount) {
  const distLines = distribution.map((d, i) => `  ${i+1}. ${d.value} (占比 ${(d.weight*100).toFixed(0)}%)`).join('\n');
  const enumText = allValues.join(' | ');
  return `你是一位资深形象顾问。以下是某人上传的一组「${imageCount}张同风格照片」中，「${dimLabel}」这个维度的AI分析汇总。

【分析结果】（按出现频率排序）:
${distLines}

注意：以上结果是来自${imageCount}张属于同一个风格的图片。也就是说，这个人在这个风格下会穿/使用以上多种不同的${dimLabel}。

【${dimLabel}的所有合法选项】:
${enumText}

请完成以下任务：

1. 【提炼共同特征】以上不同选项之间有什么隐含的风格共同点？
   要求：用一句话概括（不超过20字），聚焦于风格属性（如剪裁/质感/色调/场合感），不要逐个列举。
2. 【选出标准标签】从上述「所有合法选项」中，选出1个最能代表这种共同特征的**标准标签**。
   - 如果某个单一标签就能很好地代表这个群体，直接输出它
   - 如果没有单一的完美代表（比如同时包含裙子和裤子），则输出 "MULTI"，并在 altLabels 中列出2-3个代表
3. 【给出理由】简述选择理由（不超过25字）

严格输出 JSON，不要 markdown 包裹，不要解释文字：
{
  "commonTrait": "20字以内的共同特征描述",
  "standardLabel": "单个枚举值字符串 或 MULTI 字符串",
  "altLabels": ["备选标签1", "备选标签2"],
  "reasoning": "25字以内的选择理由"
}`;
}

async function summarizeScatteredDim(dimKey, dimLabel, distribution, allValues, imageCount) {
  const prompt = buildScatteredDimPrompt(dimKey, dimLabel, distribution, allValues, imageCount);
  try {
    const rawResponse = await callLLMText(prompt);
    const cleaned = rawResponse.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('无法解析JSON');
    }
    return {
      commonTrait: parsed.commonTrait || '',
      standardLabel: parsed.standardLabel || distribution[0]?.value || '',
      altLabels: Array.isArray(parsed.altLabels) ? parsed.altLabels : [],
      reasoning: parsed.reasoning || ''
    };
  } catch (error) {
    console.warn(`[C类归纳失败] ${dimKey}: ${error.message}`);
    return {
      commonTrait: '(归纳暂不可用)',
      standardLabel: distribution[0]?.value || '',
      altLabels: distribution.slice(1, 3).map(d => d.value),
      reasoning: '降级: 使用最高频值',
      error: error.message
    };
  }
}

// 批量处理所有C类维度（一次LLM调用）
async function summarizeAllScatteredDims(scatteredDims, imageCount) {
  const dimsBlock = scatteredDims.map((d, idx) => {
    const distLines = d.distribution
      .map((item, i) => `    ${i+1}. ${item.value} (${(item.weight*100).toFixed(0)}%)`).join('\n');
    const enumLine = d.allValues.join(' | ');
    return `维度${idx+1}: ${d.dimLabel} (${d.dimKey})\n  合法选项: ${enumLine}\n  分析结果:\n${distLines}`;
  }).join('\n\n');

  const prompt = `你是资深形象顾问。以下是一组同风格照片中，几个"单品类"维度的AI分析汇总。这些维度每张图的实物不同是正常的（如同一个人不会总穿同一件T恤），但它们应该有风格上的共同点。

【各维度数据】
${dimsBlock}

请对每个维度分别输出归纳结果：

严格输出 JSON 数组（顺序对应上面的维度1/2/3...），不要markdown包裹：
[
  {
    "commonTrait": "共同特征（20字以内）",
    "standardLabel": "标准标签（必须是上面给出的合法选项之一）或 MULTI",
    "altLabels": ["备选1", "备选2"],
    "reasoning": "理由（25字以内）"
  }
]`;

  try {
    const raw = await callLLMText(prompt);
    const cleaned = raw.replace(/^```\w*\s*|^```|\s*```$/g, '').trim();
    const results = JSON.parse(cleaned);
    const map = new Map();
    scatteredDims.forEach((d, idx) => {
      const r = results[idx] || {};
      map.set(d.dimKey, {
        commonTrait: r.commonTrait || '',
        standardLabel: r.standardLabel || d.distribution[0]?.value || '',
        altLabels: Array.isArray(r.altLabels) ? r.altLabels : [],
        reasoning: r.reasoning || ''
      });
    });
    return map;
  } catch (error) {
    console.warn('[批量C类归纳失败]', error.message);
    const fallback = new Map();
    scatteredDims.forEach(d => fallback.set(d.dimKey, {
      commonTrait: '(归纳不可用)', standardLabel: d.distribution[0]?.value || '',
      altLabels: d.distribution.slice(1, 3).map(x => x.value), reasoning: '降级: 最高频值'
    }));
    return fallback;
  }
}

function assembleClassCResult(dimKey, dimLabel, aggData, llmSummary) {
  const d = aggData[dimKey];
  const safeDist = Array.isArray(d?.distribution) ? d.distribution : [];
  return {
    dimension: dimKey, label: dimLabel, level: 'C', displayMode: 'summarized',
    consensus: llmSummary.standardLabel,
    commonTrait: llmSummary.commonTrait,
    reasoning: llmSummary.reasoning,
    alternatives: Array.isArray(llmSummary.altLabels) && llmSummary.altLabels.length > 0
      ? llmSummary.altLabels
      : safeDist.slice(1, 4).map(x => ({ value: x.value, weight: x.weight, pct: `${(x.weight*100).toFixed(0)}%` })),
    rawDistribution: safeDist,
    support: `${d?.visibleCount || 0}张`,
    error: llmSummary.error || null
  };
}

// ============== 标准化聚合主入口 ==============
async function standardizeAggregate(agg, imageCount) {
  const result = { dimensions: {}, byGroup: {}, classStats: { A:0, B:0, C:0 }, summary: '' };
  const cClassDims = [];

  for (const dim of STYLE_DIMENSIONS) {
    const d = agg[dim.key];
    if (!d || !d.distribution?.length) continue;

    const conc = calcConcentration(d.distribution);
    let cls = classifyDimension(conc, d.visibleCount);
    cls = finalClassification(dim.key, cls);
    result.classStats[cls.level]++;

    let dimResult;
    if (cls.level === 'A') {
      dimResult = aggregateClassA(dim.key, dim.label, agg);
    } else if (cls.level === 'B') {
      dimResult = aggregateClassB(dim.key, dim.label, agg);
    } else {
      cClassDims.push({
        dimKey: dim.key, dimLabel: dim.label,
        distribution: d.distribution,
        allValues: dim.values || getAllSubStyleValues(dim), aggData: d
      });
      dimResult = {
        dimension: dim.key, label: dim.label, level: 'C', displayMode: 'summarized',
        status: 'pending', consensus: '-', commonTrait: 'AI 分析中...',
        rawDistribution: d.distribution, support: `${d.visibleCount}张`
      };
    }

    dimResult._classInfo = cls;
    result.dimensions[dim.key] = dimResult;
    (result.byGroup[dim.group] ||= []).push(dimResult);
  }

  // 批量 C 类 LLM 调用
  if (cClassDims.length > 0) {
    const cResults = await summarizeAllScatteredDims(cClassDims, imageCount);
    for (const cd of cClassDims) {
      const summary = cResults.get(cd.dimKey);
      const assembled = assembleClassCResult(cd.dimKey, cd.dimLabel, cd.aggData, summary);
      assembled._classInfo = result.dimensions[cd.dimKey]._classInfo;
      result.dimensions[cd.dimKey] = assembled;
      const groupArr = result.byGroup[STYLE_DIMENSIONS.find(d => d.key === cd.dimKey)?.group];
      if (groupArr) { const idx = groupArr.findIndex(x => x.dimension === cd.dimKey); if (idx >= 0) groupArr[idx] = assembled; }
    }
  }

  result.summary = buildOneLineFormula(result);
  return result;
}

// ============== 一句话 DNA 公式生成 ==============
function buildOneLineFormula(stdResult) {
  const parts = [];
  for (const g of ['妆容','发型','穿搭','配饰','氛围']) {
    const dims = stdResult.byGroup[g] || [];
    const items = dims.map(d => {
      if (d.level === 'A' && d.consensus && d.consensus !== '-') return d.consensus;
      if (d.level === 'B' && d.primary) return d.primary;
      if (d.level === 'C' && d.consensus && d.consensus !== '-' && d.consensus !== 'AI 分析中...') return d.consensus;
      return '';
    }).filter(Boolean);
    if (items.length) parts.push(items.join('·'));
  }
  return parts.join(' × ');
}

// ============== 调纯文本 LLM（复用同一 endpoint，用于生成风格画像） ==============
async function callLLMText(prompt) {
  const apiBase = document.getElementById('apiBase').value.trim().replace(/\/+$/,'');
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value.trim();
  const protocol = document.getElementById('apiProtocol')?.value || 'chat';
  if (!apiKey) throw new Error('请填写 API Key');

  let url, body, parseContent;
  if (protocol === 'responses') {
    url = `${apiBase}/responses`;
    body = {
      model,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }]
    };
    parseContent = (data) => {
      if (typeof data.output_text === 'string') return data.output_text;
      if (Array.isArray(data.output)) {
        for (const item of data.output) {
          const c = item.content;
          if (Array.isArray(c)) for (const seg of c) {
            if (typeof seg.text === 'string') return seg.text;
          }
        }
      }
      return '';
    };
  } else {
    url = `${apiBase}/chat/completions`;
    body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    };
    parseContent = (data) => data.choices?.[0]?.message?.content || '';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`画像生成 HTTP ${res.status}: ${(await res.text()).slice(0,200)}`);
  const data = await res.json();
  return (parseContent(data) || '').trim();
}

// ============== 生成"风格总结"自然语言描述（含关键词） ==============
async function generatePersona(agg, imageCount) {
  const groupOrder = {};
  for (const dim of STYLE_DIMENSIONS) {
    const r = agg[dim.key];
    if (!r || !r.distribution.length) continue;
    const top = r.distribution.slice(0,3)
      .map(x => `${x.value}(${(x.weight*100).toFixed(0)}%)`).join('、');
    let catInfo = '';
    if (r.layered && r.categoryDistribution.length) {
      const catTop = r.categoryDistribution.slice(0,3)
        .map(c => `${c.categoryName}(${(c.weight*100).toFixed(0)}%)`).join('、');
      catInfo = `  [大类: ${catTop}]`;
    }
    (groupOrder[dim.group] ||= []).push(`  - ${dim.label}: ${top}  [可见${r.visibleCount}/${imageCount}张, 平均置信${(r.avgConfidence*100).toFixed(0)}%]${catInfo}`);
  }
  const dataBlock = Object.entries(groupOrder)
    .map(([g, arr]) => `【${g}】\n${arr.join('\n')}`).join('\n\n');

  // 取主风格名用于结论首句
  let mainStyleLabel = '';
  const outfitDist = agg.outfit_style?.distribution;
  if (outfitDist?.length) mainStyleLabel = outfitDist[0].value;
  else {
    const makeupDist = agg.makeup_style?.distribution;
    if (makeupDist?.length) mainStyleLabel = makeupDist[0].value;
  }

  const prompt = `以下是某用户 ${imageCount} 张同风格照片经AI分析后聚合得到的"风格DNA"统计数据：

${dataBlock}

请基于以上数据，完成以下两项输出：

【1. 风格总结】用 80-140 字写一段风格总结。要求：
- 以"${mainStyleLabel || '该风格'}的整体基调"开头，直接描述整体风格走向
- 概括核心标志性元素（妆容/发型/穿搭/氛围里最突出的 3-5 个特征）
- 如果有次要倾向（占比20%-40%），点一句作为调剂
- 像时尚博主点评，不要空话套话；不要列表格、不要分点

【2. 关键词】提取 5-8 个能概括此风格的关键词（2字或4字词为主，如 清冷/极简/利落/知性）

严格输出 JSON（不要markdown包裹）：
{
  "summary": "风格总结正文",
  "keywords": ["关键词1", "关键词2", "关键词3"]
}`;

  try {
    const raw = await callLLMText(prompt);
    const cleaned = raw.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('无法解析JSON');
    }
    return { text: parsed.summary || '', keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [] };
  } catch (e) {
    console.warn('[风格总结失败]', e.message);
    return { text: '', keywords: [], error: e.message };
  }
}

// ============== 渲染结果 ==============
function renderResult(agg) {
  document.getElementById('emptyCard').style.display = 'none';
  document.getElementById('resultCard').style.display = 'block';

  // 摘要：每维度的主标签 + 占比（基于 N 张图 top1 投票）
  const groups = {};
  for (const dim of STYLE_DIMENSIONS) {
    const r = agg[dim.key];
    if (!r || !r.distribution.length) continue;
    const topCat = r.layered && r.categoryDistribution.length ? r.categoryDistribution[0] : null;
    (groups[dim.group] ||= []).push({ label: dim.label, top: r.distribution[0], n: r.visibleCount, layered: r.layered, topCat });
  }
  const summaryHtml = Object.entries(groups).map(([g, arr]) => {
    const items = arr.map(a => {
      const catStr = a.layered && a.topCat ? `<span style="color:#6366f1;font-size:11px">[${a.topCat.categoryName}]</span> ` : '';
      return `<span style="margin-right:14px"><b>${a.label}</b>: ${catStr}${a.top.value} <span style="color:#a855f7">${(a.top.weight*100).toFixed(0)}%</span> <span style="color:#9ca3af;font-size:11px">(${a.n}张)</span></span>`;
    }).join('');
    return `<div class="summary-card"><div class="label">${g}</div><div class="value" style="font-size:14px;font-weight:500;color:#374151;margin-top:6px">${items}</div></div>`;
  }).join('');
  document.getElementById('summaryArea').innerHTML = summaryHtml;

  // 公式
  const formula = STYLE_DIMENSIONS.map(dim => {
    const r = agg[dim.key];
    if (!r || !r.distribution.length) return `<div class="formula-line"><span class="formula-dim">${dim.label}</span> <span style="color:#9ca3af">— 不可见</span></div>`;
    const top = r.distribution.slice(0,3);
    const restW = r.distribution.slice(3).reduce((s,x)=>s+x.weight,0);
    const parts = top.map(x => `<span class="formula-w">${(x.weight*100).toFixed(1)}%</span>·${x.value}`);
    if (restW > 0.001) parts.push(`<span class="formula-w">${(restW*100).toFixed(1)}%</span>·其他`);
    let line = `${parts.join(' + ')}`;
    // 分层维度额外展示大类分布
    if (r.layered && r.categoryDistribution.length) {
      const catParts = r.categoryDistribution.map(c =>
        `<span class="formula-w" style="color:#6366f1">${(c.weight*100).toFixed(0)}%</span>·${c.categoryName}`
      ).join(' ');
      line += ` <span style="color:#9ca3af;font-size:11px;margin-left:8px">| 大类: ${catParts}</span>`;
    }
    return `<div class="formula-line"><span class="formula-dim">${dim.label}</span> = ${line}</div>`;
  }).join('');
  document.getElementById('formulaArea').innerHTML = formula;

  // 雷达图：每个维度的 top1 weight 当作"风格强度"
  const labels = STYLE_DIMENSIONS.map(d => d.label);
  const data = STYLE_DIMENSIONS.map(d => {
    const r = agg[d.key];
    return r?.distribution?.[0]?.weight ? +(r.distribution[0].weight * 100).toFixed(1) : 0;
  });
  if (state.chart) state.chart.destroy();
  const ctx = document.getElementById('radar').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '主标签集中度 (%)',
        data,
        backgroundColor: 'rgba(168,85,247,0.18)',
        borderColor: '#a855f7', borderWidth: 2,
        pointBackgroundColor: '#ec4899', pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25, color:'#9ca3af', backdropColor:'transparent' },
                     grid: { color: '#f3e8ff' }, angleLines: { color: '#f3e8ff' },
                     pointLabels: { font: { size: 11 }, color: '#374151' } } },
      plugins: { legend: { display: false } }
    }
  });

  document.getElementById('rawJson').textContent = JSON.stringify(agg, null, 2);

  // 单图明细
  renderPerImage();
}

// ============== 渲染：综合判断面板（卡片矩阵+结论） ==============

/** 从标准化结果中提取核心主风格标签 */
function extractCoreStyle(std) {
  // 优先取 outfit_style（服装风格）的大类或值，其次 makeup_style
  const outfit = std.dimensions?.outfit_style;
  if (outfit && outfit.consensus && outfit.consensus !== '-' && outfit.consensus !== 'AI 分析中...') {
    return { label: outfit.consensus, source: 'outfit_style', confidence: outfit.confidence || 0 };
  }
  const makeup = std.dimensions?.makeup_style;
  if (makeup && makeup.consensus && makeup.consensus !== '-') {
    return { label: makeup.consensus, source: 'makeup_style', confidence: makeup.confidence || 0 };
  }
  // 取第一个有值的 A 类维度
  for (const key of Object.keys(std.dimensions || {})) {
    const d = std.dimensions[key];
    if ((d.level === 'A' || d.level === 'B') && d.consensus && d.consensus !== '-') {
      return { label: d.consensus, source: key, confidence: d.confidence || 0 };
    }
  }
  return { label: '未知风格', source: null, confidence: 0 };
}

/** 提取辅调标签 */
function extractSubStyle(std) {
  // 取服装风格大类分布的第二名，或化妆风格的第二名作为辅调
  const agg = state.aggregated;
  if (!agg) return '';
  const outfitCat = agg.outfit_style?.categoryDistribution;
  if (outfitCat && outfitCat.length > 1) {
    return outfitCat[1].categoryName;
  }
  const makeupDist = agg.makeup_style?.distribution;
  if (makeupDist && makeupDist.length > 1) {
    return makeupDist[1].value;
  }
  return '';
}

function renderStandardizedFormula(std) {
  const container = document.getElementById('stdFormulaArea');
  if (!container) return;

  // 核心主风格
  const core = extractCoreStyle(std);
  const subStyle = extractSubStyle(std);
  const corePct = core.confidence ? (core.confidence * 100).toFixed(0) : '-';

  // 四象限分组：妆容、发型、穿搭（含配饰）、氛围
  const quadGroups = [
    { key: 'makeup', name: '妆容', icon: '🎨', groups: ['妆容'] },
    { key: 'hair', name: '发型', icon: '💇', groups: ['发型'] },
    { key: 'outfit', name: '穿搭', icon: '👗', groups: ['穿搭', '配饰'] },
    { key: 'vibe', name: '氛围', icon: '📸', groups: ['氛围'] }
  ];

  // 构建每个象限的内容
  const quadContents = quadGroups.map(qg => {
    const items = [];
    for (const dim of STYLE_DIMENSIONS) {
      if (!qg.groups.includes(dim.group)) continue;
      const d = std.dimensions[dim.key];
      if (!d) continue;

      const showPct = (d.level === 'A' || d.level === 'B') && d.confidence != null;
      const pctStr = showPct ? `<span class="mc-quad-pct">${(d.confidence * 100).toFixed(0)}%</span>` : '';

      if (d.displayMode === 'single' || d.displayMode === undefined) {
        const traits = (d.samples || []).slice(0,2).map(s => s.reason).filter(Boolean).join(' · ');
        items.push(`<div class="mc-quad-item">
          <div class="mc-quad-label">${dim.label}</div>
          <div class="mc-quad-value">${d.consensus}${pctStr}</div>
          ${traits ? `<div class="mc-quad-traits">${traits}</div>` : ''}
        </div>`);
      } else if (d.displayMode === 'multi') {
        const tags = (d.alternatives || []).slice(0,3).map((a,i) =>
          `<span class="mc-quad-tag${i === 0 ? ' mc-quad-tag-main' : ''}">${a.value}</span>`
        ).join('');
        items.push(`<div class="mc-quad-item">
          <div class="mc-quad-label">${dim.label}</div>
          <div class="mc-quad-value">${d.primary || '-'}${pctStr}</div>
          <div class="mc-quad-tags">${tags}</div>
        </div>`);
      } else if (d.displayMode === 'summarized') {
        if (d.status === 'pending') {
          items.push(`<div class="mc-quad-item">
            <div class="mc-quad-label">${dim.label}</div>
            <div class="mc-quad-value" style="color:#a855f7">⏳ AI分析中...</div>
          </div>`);
        } else {
          const altTags = Array.isArray(d.alternatives) && d.alternatives.length
            ? d.alternatives.slice(0,3).map(a =>
                typeof a === 'string' ? `<span class="mc-quad-tag">${a}</span>`
                : `<span class="mc-quad-tag">${a.value}</span>`
              ).join('')
            : '';
          items.push(`<div class="mc-quad-item">
            <div class="mc-quad-label">${dim.label}</div>
            <div class="mc-quad-value">${d.consensus || '-'}<span style="font-size:10px;color:#a855f7"> (标准)</span></div>
            <div class="mc-quad-traits">${d.commonTrait || ''}</div>
            ${altTags ? `<div class="mc-quad-tags">${altTags}</div>` : ''}
          </div>`);
        }
      }
    }
    return `<div class="mc-quad-box ${qg.key}-box">
      <div class="mc-quad-header">${qg.icon} ${qg.name}</div>
      <div class="mc-quad-content">${items.join('')}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="matrix-container">
      <div class="mc-core-banner">
        <div class="mc-core-label">${core.label}</div>
        <div class="mc-core-meta">一致性 ${corePct}%${subStyle ? ` · 辅调: ${subStyle}` : ''}</div>
      </div>
      <div class="mc-quadrant">
        ${quadContents}
      </div>
    </div>
    <div id="conclusionArea" class="conclusion-area">
      <div class="conclusion-loading">⏳ AI 正在生成风格总结...</div>
    </div>`;

  // 结论内容异步填充（由外部调用 renderConclusion）
}

// ============== 渲染：结论板块 ==============
function renderConclusion(text, keywords) {
  const area = document.getElementById('conclusionArea');
  if (!area) return;
  const kwHtml = Array.isArray(keywords) && keywords.length
    ? `<div class="kw-line">🔑 关键词：${keywords.map(k => `<span class="kw-tag">${k}</span>`).join('')}</div>`
    : '';
  area.innerHTML = `
    <div class="conclusion-text">${text.replace(/\n/g, '<br>')}</div>
    ${kwHtml}`;
}

// ============== 渲染：每张图的特征卡片墙（方案B） ==============

/** 构建单张图的 DNA 一句话公式 */
function buildImageDNA(dims) {
  const parts = [];
  for (const g of ['妆容','发型','穿搭','配饰','氛围']) {
    const items = [];
    for (const dim of STYLE_DIMENSIONS) {
      if (dim.group !== g) continue;
      const r = dims[dim.key];
      if (!r || r.visible === false || !r.value) continue;
      // 分层维度：只显示细分值
      items.push(r.value);
    }
    if (items.length) parts.push(items.join('·'));
  }
  return parts.join(' × ') || '—';
}

/** 收集单张图所有可见维度的视觉线索 */
function gatherVisualClues(dims) {
  const clues = [];
  for (const dim of STYLE_DIMENSIONS) {
    const r = dims[dim.key];
    if (!r || r.visible === false || !r.value || !r.reason) continue;
    clues.push(r.reason);
  }
  return clues.join(' + ') || '';
}

function renderPerImage() {
  const wrap = document.getElementById('perImageArea');
  const ok = state.images.filter(i => i.status === 'done' || i.status === 'err');
  document.getElementById('perImageCount').textContent = `(${ok.length}张)`;

  if (!ok.length) {
    wrap.innerHTML = '<div class="empty">还没有完成分析的图片</div>';
    return;
  }

  const html = ok.map((img, idx) => {
    // 失败卡片
    if (img.status === 'err') {
      return `<div class="img-card img-card-error">
        <div class="ic-left">
          <img src="${img.dataUrl}" />
          <div class="ic-meta">#${idx+1} · ${(img.file?.name||'').slice(0,24)}</div>
        </div>
        <div class="ic-body">
          <div class="ic-err-tip">❌ 分析失败：${(img.error||'').slice(0,200)}</div>
        </div>
      </div>`;
    }

    const dims = img.result?.dimensions || {};

    // 构建 DNA 公式
    const dna = buildImageDNA(dims);

    // 视觉线索汇总
    const clues = gatherVisualClues(dims);

    // 5 列分组网格
    const groupIcons = { '妆容':'🎨','发型':'💇','穿搭':'👗','配饰':'💍','氛围':'📸' };
    const groupColors = { '妆容':'makeup-col','发型':'hair-col','穿搭':'outfit-col','配饰':'acc-col','氛围':'vibe-col' };

    const colsHtml = ['妆容','发型','穿搭','配饰','氛围'].map(g => {
      const gDims = STYLE_DIMENSIONS.filter(d => d.group === g);
      if (!gDims.length) return '';
      const icon = groupIcons[g] || '';
      const rows = gDims.map(dim => {
        const r = dims[dim.key];
        if (!r || r.visible === false || !r.value) {
          return `<div class="ic-dim-row ic-dim-invisible">
            <span class="ic-dim-label">${dim.label}</span><span class="ic-dim-value">—</span></div>`;
        }
        const conf = Number(r.confidence) || 0;
        const confColor = conf >= 0.7 ? 'conf-high' : conf >= 0.4 ? 'conf-mid' : 'conf-low';
        const reasonEl = r.reason ? `<span class="ic-reason">${r.reason}</span>` : '';
        // 分层维度显示大类→细分
        if (dim.layered && r.category) {
          const catName = (dim.categories.find(c=>c.key===r.category)||{}).name||r.category;
          return `<div class="ic-dim-row">
            <span class="ic-dim-label">${dim.label}</span>
            <span class="ic-dim-value"><span class="ic-cat">${catName}</span> <span class="ic-val-text">${r.value}</span> <span class="ic-conf ${confColor}">${conf}</span></span>
            ${reasonEl}
          </div>`;
        }
        return `<div class="ic-dim-row">
          <span class="ic-dim-label">${dim.label}</span>
          <span class="ic-dim-value"><span class="ic-val-text">${r.value}</span> <span class="ic-conf ${confColor}">${conf}</span></span>
          ${reasonEl}
        </div>`;
      }).join('');

      return `<div class="ic-col ${groupColors[g] || ''}">
        <div class="ic-col-header">${icon} ${g}</div>
        <div class="ic-col-body">${rows}</div>
      </div>`;
    }).join('');

    const partialTip = img.partialError
      ? `<div class="ic-partial-tip">⚠️ 部分分组失败：${img.partialError.slice(0,200)}</div>` : '';

    return `<div class="img-card">
      <div class="ic-left">
        <img src="${img.dataUrl}" />
        <div class="ic-meta">#${idx+1} · ${(img.file?.name||'').slice(0,24)}</div>
        ${partialTip}
      </div>
      <div class="ic-body">
        <div class="ic-dna-bar">
          <span class="ic-dna-icon">🧬</span>
          <span class="ic-dna-text">${dna}</span>
        </div>
        <div class="ic-grid">${colsHtml}</div>
        ${clues ? `<div class="ic-clues">👁 视觉线索: ${clues}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = html;
}

// ============== Tab 切换 ==============
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    const target = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${target}`);
    });
  });
});

// 页面加载时：如果已配置 JSONBin，预加载历史记录（历史记录卡片始终可见）
if (document.getElementById('jsonbinKey')?.value && document.getElementById('jsonbinId')?.value) {
  loadFromJSONBin();
}

// ============== 主流程 ==============
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { toast('请先填写 API Key'); return; }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true; btn.textContent = '🔄 分析中...';
  document.getElementById('progress').style.display = 'block';
  const bar = document.getElementById('progressBar');
  bar.style.width = '0%';

  // 重置图片状态
  state.images.forEach(i => { if (i.status !== 'done') { i.status = 'pending'; i.result = null; i.error = null; } });
  renderThumbs();

  const concurrency = Number(document.getElementById('concurrency').value) || 3;
  const targets = state.images.filter(i => i.status !== 'done');

  await runWithConcurrency(targets, concurrency,
    async (img) => {
      img.status = 'running'; renderThumbs();
      // 单图内部 5 组并行；外层 concurrency 控制图片之间的并发
      img.result = await analyzeImage(img);
      img.status = 'done';
    },
    (done, total) => { bar.style.width = `${(done/total*100).toFixed(0)}%`; }
  );

  const ok = state.images.filter(i => i.status === 'done');
  const failed = state.images.filter(i => i.status === 'err');
  const partial = state.images.filter(i => i.status === 'done' && i.partialError);
  if (failed.length) toast(`${failed.length} 张完全失败：${failed[0].error?.slice(0,60)}`);
  else if (partial.length) toast(`${partial.length} 张部分组失败，已用其余维度聚合`);
  if (ok.length === 0) {
    btn.disabled = false; btn.textContent = '🔍 开始分析';
    return;
  }

  state.aggregated = aggregate(state.images);
  renderResult(state.aggregated);

  // 异步生成标准化公式 + 结论（不阻塞主结果展示）
  let personaResult = null; // 提升作用域供后续保存使用
  const stdArea = document.getElementById('stdFormulaArea');
  if (stdArea && ok.length >= 3) {
    stdArea.innerHTML = '<div class="c-pending" style="text-align:center;padding:40px">⏳ AI 正在分析维度特征，生成风格DNA...</div>';
    try {
      state.standardized = await standardizeAggregate(state.aggregated, ok.length);
      renderStandardizedFormula(state.standardized);

      // 异步生成结论（渲染到 stdFormulaArea 内的 conclusionArea）
      const concArea = document.getElementById('conclusionArea');
      if (concArea) {
        try {
          personaResult = await generatePersona(state.aggregated, ok.length);
          if (personaResult.text) {
            renderConclusion(personaResult.text, personaResult.keywords);
          } else {
            concArea.innerHTML = `<div class="persona-err">⚠️ 风格总结生成失败：${(personaResult.error||'未知错误').slice(0,120)}</div>`;
          }
        } catch (e) {
          concArea.innerHTML = `<div class="persona-err">⚠️ 风格总结生成失败：${(e.message||'').slice(0,120)}</div>`;
        }
      }
    } catch (e) {
      stdArea.innerHTML = `<div class="persona-err">⚠️ 标准化公式生成失败：${(e.message||'').slice(0,120)}</div>`;
    }
  } else if (stdArea) {
    stdArea.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">💡 上传 ≥3 张图片后激活综合判断</div>';
  }

  btn.disabled = false; btn.textContent = '🔍 重新分析';
  setTimeout(() => { document.getElementById('progress').style.display = 'none'; }, 800);

  // 自动保存分析结果到 JSONBin（异步，不阻塞UI）
  const coreStyle = state.standardized
    ? (extractCoreStyle(state.standardized).label || '')
    : (state.aggregated?.outfit_style?.distribution?.[0]?.value || '');
  saveToJSONBin({
    imageCount: ok.length,
    coreStyle,
    summary: personaResult?.text || '',
    keywords: personaResult?.keywords || [],
    formula: state.standardized ? buildOneLineFormula(state.standardized) : '',
    standardized: state.standardized,
    aggregated: state.aggregated
  });
});
