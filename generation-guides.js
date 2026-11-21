import {fail} from './store.js';

const guides = {
  schema: {
    name: '语义页面定义与编译',
    applies: '维护已有 page.design.json 页面。',
    steps: [
      'task.get 确认当前页面 ID、修订号、范围和固定规范，读取项目要求、选中技能及规范 rule.md。',
      'schema.catalog 按需读取组件、动作与场景协议。将用户的信息架构组织为 layout/text/image/component/repeat 节点。',
      '在 state 中提供业务示例数据。表单在 fields 声明规则、输入属性与示例值绑定，form.submit 校验并定位错误；多步流程在成功分支更新步骤，再用 focus 聚焦新显示的标题。将需要独立设计的状态登记为 scenes，以 state/ui 恢复对应上下文。',
      'schema.apply 携带 pageId、expectedRevision 和完整 document。宿主完成真实规范资源复制、WC/原生控件与交互编译，并保存规范源和可编辑场景。',
      '首次保存后以 schema.apply operations 提交具体差异。source.set 的 pointer 可定位 /nodes/form/props/fields/0/label 等 JSON 值；source.replaceText 的 pointer、find、replace 可替换 /css 或 /script 内唯一匹配的片段。需要核对原值时，schema.read 使用相同 pointer。',
      '确认弹窗与抽屉使用宿主提供的标题栏关闭按钮和键盘关闭行为，声明业务确认、取消动作。对照 verify 指引检查字体、布局、状态与交互，修正后重测受影响的场景。',
    ],
  },
  create: {
    name: '生成 HTML 页面',
    applies: '从项目初始页面生成用户所需的页面。',
    steps: [
      '采用任务上下文中的目标画板、修订号与已选规范，遇到修订冲突再通过 task.get 刷新。',
      '简短需求优先交付主页面、少量示例数据与核心操作。直接编写 HTML、CSS 和所需交互，以 designer_commit_html 的 artboardId、expectedRevision 和 html 保存完整页面。',
      '保存成功后查看回执。存在具体问题时集中修正，用户要求预览或验收时执行相应检查。',
    ],
  },
  system: {
    name: '使用设计规范',
    applies: '目标页面已绑定设计规范。',
    steps: [
      '通过 context.read 的 path 读取 rule.md。将需要确认的组件一起发给 system.usage，使用 brief=true 取得结构与用法，标签未知时查 system.index。',
      '保存新的 HTML 页面时，宿主会接入所选规范的 theme.css 和 components.js。页面另外直接引用的资源通过 asset.fromSystemResource 取得相对路径。',
      '表格、表单和按钮使用规范提供的组件结构、字体与交互样式。页面 CSS 用于业务布局。通过 designer_commit_html 保存并核对回执中的组件标签。',
    ],
  },
  custom: {
    name: '自定义布局',
    applies: '根据业务内容组织页面。',
    steps: ['使用 HTML 与 CSS 组织内容，在普通浏览器事件中实现请求的行为，保存后查看回执。'],
  },
  edit: {
    name: '局部修改',
    applies: '修改已保存页面、选中元素或某个已有状态。',
    steps: [
      'task.get 确认精确目标。edit.read 通过 nodeIds 获取对应节点和当前版本，按需读取局部源码。',
      '复用现有 DOM、样式变量、组件和页面事件，通过 edit.apply 提交本次需要的差异。框架源码任务使用 framework.read/write。',
      '重复内容使用 duplicate copies，复用行为并更新业务数据。保留稳定标识与用户已有修改。',
      '检查受影响的状态、关联交互与编辑保存。',
    ],
  },
  recover: {
    name: '中断和失败恢复',
    applies: '工具错误、版本冲突或生成中断后继续任务。',
    steps: [
      'task.get 和 edit.read 确认最新已保存内容、与版本。将任务清单与现有内容对照。',
      '已保存页面通过局部 edit.apply 补齐剩余范围，按完整区块或业务状态提交批次。',
      'HTML 校验失败且有 recovery 凭据时，designer_commit_html retryLast 复用失败内容并附带修正 operations。',
      '版本冲突后重新读取最新内容和 revision，保留并发修改，再提交仍需要的差异。',
      '重新验证受影响内容，最终核对整个请求的交付清单。',
    ],
  },
  verify: {
    name: '预览检查',
    applies: '生成或修改页面后。',
    steps: ['检查页面能打开、资源能加载，按需求操作表单、导航或按钮，修正观察到的问题。'],
  },
};

export function generationGuide(topic) {
  if (topic === undefined) return {topics:Object.entries(guides).map(([id,{name,applies}])=>({id,name,applies})),guidance:'Read the topic matching the current task stage. These workflows retain the frozen target and binding contracts.'};
  if (!Object.hasOwn(guides,topic)) fail('INVALID_INPUT','Unknown generation guide topic');
  return {topic,...structuredClone(guides[topic]),readonly:true};
}
