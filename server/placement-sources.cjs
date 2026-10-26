'use strict';

// This is an authoring/provenance policy, not a CEFR score computed from words.
// Eligibility never replaces placement.cjs's local-audio, content-hash and audit checks.
const POLICY_VERSION = 'placement-listening-sources-2026-10-26-v2';
const ORIGINAL_REGISTRY = 'curriculum/independent-bank/sources.json';
const AUTHORING_SOURCE = 'tools/independent-bank.cjs';
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);
const LOWER_LEVELS = new Set(['A1', 'A2']);
const LITERARY_GENRES = new Set(['fable', 'historical-humorous-prose', 'historical-travel-prose', 'historical-children-story', 'literary-first-person-narration', 'literary-adventure-narration', 'poetry-reading']);

// Each entry identifies a reviewed authored scenario and its exact content version.
// A changed body/question set or a new source requires a deliberate policy review.
const SCENARIOS = new Map([
  ['independent-a1-listen-gb', ['A1', 'everyday-dialogue', '购买公交车票与返程安排', '8d0e9b87b958bfada989a8a26e614aca01cd23b4930c5d064ae4bd019ca01e66']],
  ['independent-a1-listen-us', ['A1', 'everyday-announcement', '泳池开放、课程与设施公告', '0ce9f4d66f6fab2b65be19b0ba4372a05a8f0e4061f1134ab7fd37674dc8e336']],
  ['independent-a1-listen-au', ['A1', 'everyday-dialogue', '蔬菜箱领取、付款与停车', 'f92de53369c115c6acee0a051736b66dd0da6ac264d9fe530e4ea18de9ab0202']],
  ['independent-a1-listen-in', ['A1', 'practical-instructions', '首次使用电脑室的操作说明', '92ba1e81b7e3f3df4a4dfd1fd09aa976577ae7293a0e09556f850528da14f888']],
  ['independent-a2-listen-gb', ['A2', 'everyday-dialogue', '领取包裹、身份证明与代领条件', '0cc465cd49f01e2d66f930fdf9c1c30658a745281c51a38d1714f0c9bd12ae4b']],
  ['independent-a2-listen-us', ['A2', 'practical-instructions', '图书馆新志愿者培训安排', '2a10d3201bd06f1a6459b4cdf9ef04be5c48b42ddeb1db3235839d77a51bcf36']],
  ['independent-a2-listen-au', ['A2', 'everyday-dialogue', '预订海岸步行活动与集合要求', '09a1a72e9c731183ec44893b57860bc5bee92221186d5634306ecab83ba07c89']],
  ['independent-a2-listen-in', ['A2', 'everyday-dialogue', '借用录音设备与归还、试录要求', 'f1c3d418e6c3ef61bb40add405141fe597acfd9fbea481902f93d286f26c0a0c']],
  ['independent-b1-listen-gb', ['B1', 'contemporary-educational-dialogue', '社区陶艺工作坊的组织安排', 'c39dc8414a35b711d9e84219a3017959396f3824fa2f58f2e049b0e51d9b0d69']],
  ['independent-b1-listen-us', ['B1', 'contemporary-educational-dialogue', '包装说明的学生研究项目', '9f4b9361b072c7966aec29ae63e712a7430384efec3eb8e3168b149cc9d1db9f']],
  ['independent-b1-listen-au', ['B1', 'contemporary-educational-dialogue', '沙丘监测实地活动准备', '75b896359c64df92db55bbd0204d9e4371dca68af0d87162d6833408b3ef3e5f']],
  ['independent-b1-listen-in', ['B1', 'contemporary-educational-dialogue', '校园咖啡馆试行方案复盘', 'ebf478c179d486a505a6acaee4454bdca0f4bf7e77c4a0b0b7ec16d0b20eca5f']],
  ['independent-b2-listen-gb', ['B2', 'contemporary-educational-dialogue', '公共艺术意见征询与证据范围', '46ccb67d2d7a232e34dd11eb4c40abc1372d69de0029da91d3c844fd5b3d9bf6']],
  ['independent-b2-listen-us', ['B2', 'contemporary-educational-dialogue', '图书馆使用人数传感器提案', 'fd96d5e51880a4ce404dc0f476fdbffd77f111fa31053d04ce7f545a61838c8a']],
  ['independent-b2-listen-au', ['B2', 'contemporary-educational-lecture', '雨水花园表现的测量与限制', 'd2966d03f58f6935ea2d68a92a389ae4ada09c4ee329e2d96a67706936bd0206']],
  ['independent-b2-listen-in', ['B2', 'contemporary-educational-dialogue', '校园步行路线研究与推断边界', '2ad9b717cd4155717aceea87dba2517911b5f2d9795be5dc723deb665baffd31']]
]);

function placementSourcePolicy(material) {
  const source = material?.source, registered = SCENARIOS.get(material?.id);
  const basis = { policyVersion: POLICY_VERSION, materialId: material?.id || null, sourceKind: source?.kind || null, sourceGenre: source?.genre || null, audioAuditRequired: true, scope: '来源与语体选材；不是考生难度标定，也不是原音完整性验证。' };
  const reject = (reason, category = 'unregistered-source') => ({ eligible: false, priority: null, category, reason, basis });
  if (!material || material.skill !== 'listening' || material.pool !== 'independent' || !LEVELS.has(material.level) || material.fullTest || material.form || material.assessmentGroup || source?.verification !== 'reviewed') return reject('仅已核对的独立分级听力可作为入学探测来源。');

  if (source.kind === 'public-domain-human-reading' || LITERARY_GENRES.has(source.genre)) {
    basis.registry = source.registry || 'curriculum/human-listening/rights-and-review.json';
    if (LOWER_LEVELS.has(material.level)) return reject('A1/A2入学探测不使用古典寓言、诗歌或历史文学朗读；原材料仍保留在独立材料库。', 'historical-literature');
    if (source.kind !== 'public-domain-human-reading' || !LITERARY_GENRES.has(source.genre) || source.registry !== 'curriculum/human-listening/sources/' + material.id + '.json') return reject('文学来源缺少匹配本材料的明确类型及来源登记。', 'historical-literature');
    return { eligible: true, priority: 1, category: 'historical-literature', reason: '高阶文学补充来源；入学选材优先使用同级当代情境，真人标签不提高优先级。', basis };
  }

  if (source.kind !== 'original' || !registered) return reject('该来源尚未登记为适合入学探测的当代情境，不凭标题或词语猜测语体与级别。');
  const [level, category, context, contentHash] = registered;
  Object.assign(basis, { registry: ORIGINAL_REGISTRY, authoringSource: AUTHORING_SOURCE, registeredLevel: level, context, reviewedContentHash: contentHash });
  if (material.level !== level || source.contentHash !== contentHash || source.genre && source.genre !== category) return reject('来源级别、内容版本或语体与已核对的选材登记不一致，请重新核对后登记。', category);
  return { eligible: true, priority: 0, category, reason: LOWER_LEVELS.has(level) ? '已登记的当代日常情境，适用于基础入学探测；原音仍须通过本地完整性审计。' : '已登记的当代社区或学习情境，优先于同级历史文学朗读。', basis };
}

module.exports = { POLICY_VERSION, placementSourcePolicy };
