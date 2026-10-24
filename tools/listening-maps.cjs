'use strict';
// Original teaching materials. Coordinates, routes and exact answer evidence are
// checked by tests/listening-maps.test.cjs; these are not official IELTS papers.
const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const location = (id, place, answer, evidence, explanation) => ({
  id, type: 'single', prompt: 'Which area contains the ' + place + '? Choose A–F.',
  options: [...letters], answers: [answer], evidence, explanation
});
const source = {
  kind: 'original', rights: '项目原创 AI 辅助教学材料；非官方 IELTS 试题', verification: 'reviewed',
  method: '原创文本、路线与图形坐标逐项核对；自动检查答案证据、选项和路径连通性。未经过真人考官验证。'
};
const instructions = '原创听力平面图练习，非官方 IELTS 试题。先看北向、入口与通道，再听录音并完成 8 题。第 1–6 题选择图中的 A–F；第 7–8 题根据路线或规则选择完整选项。字母区没有地点名称，请用录音中的转弯、相对方位和修正信息定位。可先完整听一遍，再在练习模式重听并复盘；查看转录或解析会记录辅助。无可用音频时可做文字路线练习，但不能作为独立听力证据。';

const centreTranscript = `Guide: Welcome to the Riverside Learning Centre. Before we begin, look at the plan. North is at the top, and you are entering through the door in the middle of the south wall. The main passage runs straight north. Three short passages cross it, making three junctions. Count them from the entrance, not from the top of the page.

At the first junction, turn left. The room at the end of that short passage contains the welcome desk. Please leave large bags there before joining a practical session. You may keep a small notebook with you, but bags must not be left in the main passage.

The equipment store is opposite the welcome desk, across the main passage. Some older leaflets put it on the western side. That information is out of date: the store is now east of the first junction. Collect gloves there after you have left your bag.

For the repair workshop, return to the main passage and face north again. Go past the first junction to the second one, then turn right. That room is where the practical session takes place. If you come out of the workshop and walk straight across the main passage, you reach the quiet study room. Please close its door gently; people may be working inside.

The seed library is farther north. From the entrance, walk past the first two junctions. At the third and last junction, turn left. Across the main passage from the seed library is the community meeting room. The meeting room is not next to the entrance, although that was its location before the centre was rebuilt.

Finally, if you are leaving the repair workshop, walk west to the main passage, turn left, and continue south to the entrance. Turning right would take you towards the seed library instead. Keep the passage clear at all times. We will meet at the welcome desk in ten minutes, so you have time to find each room before the session starts.`;

const parkTranscript = `Guide: Welcome to Willow Science Park. The plan shows north at the top. You enter from the west, on the left of the page. Walk east along the main path until you reach the clock. This is the first junction. There is another junction farther east, marked by a fountain. Paths connect these two junctions around both the northern and southern edges of the park.

We will begin at the local history gallery. From the clock, turn left and walk north to the corner. The gallery is immediately on your left, at the western end of the northern path. Do not continue east before entering it.

Next is the greenhouse. Leave the gallery and walk east along the northern path. Halfway between the two northern corners, the greenhouse is on your left, on the north side of the path. The bird observation room is farther along: continue east to the next corner, where its doorway is straight ahead of you, on the east side. The greenhouse and the observation room are separate buildings.

To reach the water testing workshop from the observation room, return to that corner and turn south. Follow the eastern path past the fountain without turning onto the main path. At the southern corner, the workshop is on your left, to the east. This route avoids the pond, which lies north of the main path between the clock and the fountain.

After the workshop, take the southern path west. Halfway along, the cafe is on your left, south of the path. Continue west to the next corner and you will find the equipment desk straight ahead, on the western side. Return borrowed binoculars there, not at the workshop.

You can follow the same eastern path directly from the observation room to the workshop; there is no need to return to the clock. One final rule: bicycles must be left outside the west entrance. Walking a bicycle around the park is not permitted either, because the paths are narrow. Wheelchair users are welcome on all the paths shown. Please keep these paths clear, and use the west entrance again when you leave.`;

const materials = [
  {
    id: 'listening-map-25', version: '1', week: 25, skill: 'listening', level: 'B1–B2',
    type: 'plan-labelling', topic: '社区学习中心：室内平面图与转弯定位', title: 'Riverside Learning Centre · 找到六个房间',
    pool: 'training', fullTest: false, estimatedMinutes: 25, questionCount: 8, minWords: 250, maxWords: 450,
    instructions, passage: '', transcript: centreTranscript,
    figure: {type: 'plan', title: 'Riverside Learning Centre — ground floor (not to scale)', plan: {
      width: 640, height: 480, north: {x: 605, y: 35}, entrance: {x: 320, y: 440, label: 'Entrance'},
      paths: [
        {points: [{x:320,y:440},{x:320,y:35}], label: '南北主通道'},
        {points: [{x:240,y:350},{x:400,y:350}], label: '从入口数第一个岔口'},
        {points: [{x:240,y:225},{x:400,y:225}], label: '从入口数第二个岔口'},
        {points: [{x:240,y:100},{x:400,y:100}], label: '从入口数第三个岔口'}
      ],
      zones: [
        {label:'A',x:60,y:60,w:180,h:80,position:'最北一排，西侧'},
        {label:'B',x:400,y:60,w:180,h:80,position:'最北一排，东侧'},
        {label:'C',x:60,y:185,w:180,h:80,position:'中间一排，西侧'},
        {label:'D',x:400,y:185,w:180,h:80,position:'中间一排，东侧'},
        {label:'E',x:60,y:310,w:180,h:80,position:'最靠近入口一排，西侧'},
        {label:'F',x:400,y:310,w:180,h:80,position:'最靠近入口一排，东侧'}
      ], landmarks: []
    }},
    questions: [
      location('q1','welcome desk','E','At the first junction, turn left. The room at the end of that short passage contains the welcome desk.','从南侧入口朝北走，第一个岔口左转即向西，到最南一排的西侧 E。先固定朝向，再判断 left；不是永远把图上左边当说话者左手边。'),
      location('q2','equipment store','F','the store is now east of the first junction.','now 表示新位置，旧传单的 western side 是干扰。第一个岔口的东侧是 F，也与 E 隔着主通道相对。'),
      location('q3','repair workshop','D','Go past the first junction to the second one, then turn right.','已明确 face north again。向北走到第二个岔口右转，右手方向是东，因此进入 D；不能在第一个岔口提前转弯。'),
      location('q4','quiet study room','C','If you come out of the workshop and walk straight across the main passage, you reach the quiet study room.','从东侧 D 出门向西，straight across 表示直穿主通道，不向南北转弯，因此到同一排西侧的 C。'),
      location('q5','seed library','A','At the third and last junction, turn left.','从入口朝北，越过前两个岔口，在第三个左转向西，抵达 A。third and last 同时锁定最北一排。'),
      location('q6','community meeting room','B','Across the main passage from the seed library is the community meeting room.','seed library 在 A；across the main passage 表示同排相对位置，所以为 B。过去靠近入口的旧位置不能作为现在的答案。'),
      {id:'q7',type:'single',prompt:'After walking west from the repair workshop to the main passage, how should you reach the entrance?',options:['Turn left and walk south.','Turn right and walk north.','Continue west through the quiet study room.'],answers:['Turn left and walk south.'],evidence:'walk west to the main passage, turn left, and continue south to the entrance.',explanation:'离开 D 时面向西，左手方向已变为南。入口在南端，所以应左转向南；同一个 left 会随身体朝向变化。'},
      {id:'q8',type:'single',prompt:'What must visitors do with large bags before a practical session?',options:['Leave them at the welcome desk.','Leave them in the main passage.','Take them into the repair workshop.'],answers:['Leave them at the welcome desk.'],evidence:'Please leave large bags there before joining a practical session.',explanation:'there 承接上一句 welcome desk。large bags 必须留在 E 的接待处；可携带的是 small notebook，不是大包。'}
    ], source: {...source}
  },
  {
    id: 'listening-map-31', version: '1', week: 31, skill: 'listening', level: 'B2',
    type: 'plan-labelling', topic: '科学园区：外圈路线、地标与视角变化', title: 'Willow Science Park · 沿地标寻找建筑',
    pool: 'training', fullTest: false, estimatedMinutes: 25, questionCount: 8, minWords: 250, maxWords: 450,
    instructions, passage: '', transcript: parkTranscript,
    figure: {type:'plan',title:'Willow Science Park — visitor plan (not to scale)',plan:{
      width:700,height:540,north:{x:650,y:35},entrance:{x:45,y:260,label:'West entrance'},
      paths:[
        {points:[{x:45,y:260},{x:620,y:260}],label:'东西主路，依次经过 Clock 和 Fountain'},
        {points:[{x:200,y:90},{x:200,y:430}],label:'西侧南北路'},
        {points:[{x:500,y:90},{x:500,y:430}],label:'东侧南北路'},
        {points:[{x:200,y:90},{x:500,y:90}],label:'北侧东西路'},
        {points:[{x:200,y:430},{x:500,y:430}],label:'南侧东西路'}
      ],
      zones:[
        {label:'A',x:100,y:35,w:100,h:70,position:'西北拐角的西侧'},
        {label:'B',x:300,y:20,w:100,h:70,position:'北侧路的中点北侧'},
        {label:'C',x:500,y:35,w:100,h:70,position:'东北拐角的东侧'},
        {label:'D',x:100,y:395,w:100,h:70,position:'西南拐角的西侧'},
        {label:'E',x:300,y:430,w:100,h:70,position:'南侧路的中点南侧'},
        {label:'F',x:500,y:395,w:100,h:70,position:'东南拐角的东侧'}
      ],
      landmarks:[{label:'Clock',x:200,y:260},{label:'Fountain',x:500,y:260},{label:'Pond',x:350,y:175}]
    }},
    questions:[
      location('q1','local history gallery','A','From the clock, turn left and walk north to the corner. The gallery is immediately on your left, at the western end of the northern path.','从西入口向东走到 Clock，左转向北；到西北拐角仍朝北，左手边为西，所以是 A。不要提前沿北路向东走到 B。'),
      location('q2','greenhouse','B','Halfway between the two northern corners, the greenhouse is on your left, on the north side of the path.','沿北路向东走，halfway 是两个北侧拐角中点；朝东时左手为北。图中北路中点北侧只有 B。'),
      location('q3','bird observation room','C','continue east to the next corner, where its doorway is straight ahead of you, on the east side.','沿北路继续向东，到东北拐角时 straight ahead 仍是东，不是沿东路转向南；东侧建筑为 C。'),
      location('q4','water testing workshop','F','At the southern corner, the workshop is on your left, to the east.','从 C 返回东北拐角，向南沿东路经过 Fountain。到东南拐角时面朝南，左手是东，所以是 F；不能看到 Fountain 就转进主路。'),
      location('q5','cafe','E','Halfway along, the cafe is on your left, south of the path.','沿南路向西走，中点的左手边为南，对应 E。左与南这两条线索互相校验，而不是机械选择图上左侧。'),
      location('q6','equipment desk','D','Continue west to the next corner and you will find the equipment desk straight ahead, on the western side.','从 E 继续沿南路向西，到西南拐角仍直行的方向是西，指向 D。须在那里归还望远镜，而不是回 F。'),
      {id:'q7',type:'single',prompt:'Which route goes directly from the observation room to the workshop?',options:['Follow the eastern path south past the fountain.','Return to the clock and follow the northern path.','Walk west along the northern path to the gallery.'],answers:['Follow the eastern path south past the fountain.'],evidence:'Follow the eastern path past the fountain without turning onto the main path.',explanation:'从 C 到 F 沿东侧南北路向南即可，中途经过 Fountain 不转入主路。directly 问直接路线，其他选项绕往西侧或北侧。'},
      {id:'q8',type:'single',prompt:'What is the rule for visitors who arrive by bicycle?',options:['Leave the bicycle outside the west entrance.','Walk the bicycle along the paths.','Park the bicycle beside the fountain.'],answers:['Leave the bicycle outside the west entrance.'],evidence:'bicycles must be left outside the west entrance. Walking a bicycle around the park is not permitted either',explanation:'must be left outside 是明确要求；not permitted either 进一步排除“推着自行车进入”这一看似合理的干扰项。轮椅允许通行不代表自行车也可以。'}
    ],source:{...source}
  }
];
module.exports = {materials};
