import React from "react";
import { Button, ErrorBox, Modal, downloadValue, errorValue } from "./common.jsx";
import SourcePanel from "./SourcePanel.jsx";
import RuntimePanel from "./RuntimePanel.jsx";
import DeliveryPanel from "./DeliveryPanel.jsx";
import { uploadFile } from "./upload.js";
import BindingApplication from './BindingApplication.jsx';
import {bindingFormArgs} from './binding-form.js';
import {createProjectWithOptions} from './home-project-options.js';
function WorkbenchDialogs({ ctx, modal, setModal, project, design, designs, pages, selection={}, library, workspace, api, mutate, refreshLibrary, onOpenProject, onOpenFile, onOpenContent, onOpenReplica, onBeforeProjectExit, onProjectUnavailable, onTarget, onReference, legacy, t, diagnostics, onStatus, onError }) {
  const [values, setValues] = React.useState(() => ({ name: "", description: "", goal: "", sourceKind: "requirements", bindingMode: "inherit", systemId: "", ...modal })), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(null), [result, setResult] = React.useState(null), [preview, setPreview] = React.useState(null);
  const creationCheckpoint=React.useRef(null);
  const update = (key, value) => {
    if(creationCheckpoint.current)return;
    setValues((v) => ({ ...v, [key]: value }));
    setPreview(null);
  }, close = () => {
    if (!busy) setModal(null);
  };
  const work = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const field = (name, key, area = false, required = false) => <label data-field={key}>{name}{area ? <textarea rows={4} value={values[key] ?? ""} onChange={(e) => update(key, e.target.value)} required={required} /> : <input value={values[key] ?? ""} onChange={(e) => update(key, e.target.value)} required={required} />}</label>;
  const systemSelect = <label>设计体系<select value={values.systemId || ""} onChange={(e) => update("systemId", e.target.value)}><option value="">不绑定</option>{library.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>;
  const bindingArgs=()=>bindingFormArgs(values,{projectId:project.id,designId:design?.id,systems:library.systems});
  const type = modal.type;
  const title = type==='source'&&modal.provider==='mastergo'?'MasterGo 导入':type==='source'&&modal.provider==='website'?'网页复刻':{ project: values.projectId ? "\u9879\u76EE\u8BBE\u7F6E" : "\u65B0\u5EFA\u9879\u76EE", group: values.id ? "\u7BA1\u7406\u5206\u7EC4" : "\u65B0\u5EFA\u5206\u7EC4", newDesign: "\u65B0\u5EFA\u8BBE\u8BA1", design: values.designId ? "\u8BBE\u8BA1\u8BBE\u7F6E" : "\u65B0\u5EFA\u8BBE\u8BA1", page: values.page ? "\u9875\u9762\u8BBE\u7F6E" : "\u521B\u5EFA\u9875\u9762", file: "\u6587\u4EF6\u4E0E\u8D44\u6E90", binding: "\u6709\u6548\u8BBE\u8BA1\u4F53\u7CFB\u4E0E\u7ED1\u5B9A", history: "\u8BBE\u8BA1\u5386\u53F2", diagnostics: "\u6821\u9A8C\u4E0E\u8BCA\u65AD", source: "\u6765\u6E90\u9009\u62E9\u3001\u8FD8\u539F\u4E0E\u6BD4\u8F83", runtime: "\u5916\u90E8\u6E90\u7801\u4E0E Git", delivery: "\u5BFC\u51FA\u4E0E\u5206\u4EAB" }[type] || type;
  const submit = (e) => {
    e?.preventDefault();
    work(async () => {
      if (type === "project") {
        if (values.projectId) {
          await mutate("project.update", { projectId: values.projectId, expectedRevision: values.revision, name: values.name, description: values.description, groupId: values.groupId || null });
        } else {
          const initialized = await createProjectWithOptions(api, { name: values.name, description: values.description, groupId: values.groupId || null, saveLocation: values.saveLocation || void 0, goal: values.goal, start: { kind: values.startKind || "empty", url: values.url, path: values.path }, systemId: values.systemId || void 0 }, {checkpoint:creationCheckpoint.current,onCheckpoint:value=>{creationCheckpoint.current=value;}});
          const p = initialized.project;
          if (values.systemId && p.systemId !== values.systemId) await api("binding.set", { projectId: p.id, expectedRevision: initialized.projectRevision || initialized.project?.revision, scope: "project", systemId: values.systemId });
          await refreshLibrary();
          await onOpenProject(p.id);
        }
      } else if (type === "group") {
        await api(values.id ? "group.update" : "group.create", { ...values.id ? { groupId: values.id, expectedRevision: values.revision } : {}, name: values.name });
        await refreshLibrary();
      } else if (type === "design") {
        if (values.designId) await mutate("design.update", { designId: values.designId, name: values.name });
        else {
          const r = await mutate("design.create", { name: values.name, binding: { mode: "inherit" }, source: { kind: values.sourceKind, url: values.url } });
          const d = r.design;
          if (values.sourceKind === "requirements") {
            onTarget({ projectId: project.id, designId: d?.id, scope: "design" });
            if (project.workbench?.requirementsPath) onReference({ projectId: project.id, type: "file", path: project.workbench.requirementsPath, label: "\u9879\u76EE\u9700\u6C42" });
          } else {
            onOpenContent("source", { designId: d?.id, provider: values.sourceKind });
            close();
            return;
          }
        }
      } else if (type === "page") {
        if (values.page) await mutate("page.update", { pageId: values.page.id, designId: values.designId, name: values.name || values.page.name, viewport: { width: Number(values.width) || values.page.viewport?.width || 1440, height: Number(values.height) || values.page.viewport?.height || 900 } });
        else await mutate("page.create", { designId: values.designId, name: values.name });
      } else if (type === "file") {
        const action = values.fileAction || "create";
        if (action === "asset") {
          close();
          return;
        }
        const basis = action !== "create" ? await api("file.read", { projectId: project.id, path: values.path }) : null;
        const r = await mutate("file." + action, { path: values.path, fileId: basis?.fileId, expectedVersion: basis?.version ?? null, ...action === "create" ? { content: values.content || "", expectedVersion: null } : {}, ...action === "rename" ? { name: values.newName } : {}, ...["move", "copy"].includes(action) ? { to: values.destination } : {}, deleteFiles: !!values.deleteFiles });
        if (action === "create") await onOpenFile(r.file || { path: values.path, name: values.path.split("/").pop() }, true);
      }
      close();
    });
  };
  const upload = async (file) => {
    if (!file) return;
    await work(async () => {
      const basis = values.replace ? await api("file.read", { projectId: project.id, fileId: values.fileId, path: values.path }) : null;
      const value = await uploadFile(api, file, { projectId: project.id, purpose: "asset", name: file.name, mediaType: file.type || "application/octet-stream", designId: design?.id, expectedRevision: project.revision, fileId: basis?.fileId || values.fileId, path: values.path || void 0, expectedVersion: basis?.version, replace: !!values.replace });
      setResult(value);
      await mutate("workspace.open", {}, true);
    });
  };
  return <Modal key={type + (modal.designId || modal.projectId || "")} title={title} onClose={close} className={`wb-dialog-${type}`} wide={["source", "runtime", "delivery", "history", "diagnostics"].includes(type)}><ErrorBox error={error} onClose={() => setError(null)} context={title}/>{type === "newDesign" ? <div className="wb-stack"><p className="wb-muted">每份设计有独立页面、资源与规范继承。选择设计起点。</p><div className="wb-operation-grid">{[["requirements", "\u9700\u6C42\u751F\u6210", "从项目需求和业务目标生成可编辑页面。"], ["website", "\u7F51\u7AD9\u590D\u523B", "\u91C7\u96C6\u771F\u5B9E\u9875\u9762\u3001\u8D44\u6E90\u548C\u72B6\u6001\uFF0C\u6BD4\u8F83\u540E\u8FD8\u539F\u3002"], ["mastergo", "MasterGo \u8FD8\u539F", "\u9009\u62E9\u6587\u4EF6\u3001\u9875\u9762\u548C\u8282\u70B9\uFF0C\u8BFB\u53D6\u5E03\u5C40\u4E0E\u8D44\u6E90\u3002"], ["figma", "Figma \u8FD8\u539F", "\u4F7F\u7528\u5B98\u65B9\u8FDE\u63A5\u8BFB\u53D6\u5DF2\u6709\u8BBE\u8BA1\u3002"]].map(([id, label, desc]) => <Button key={id} style={{ display: "block", whiteSpace: "normal", textAlign: "left", padding: 17 }} onClick={() => setModal({ type: "design", sourceKind: id })}><strong>{label}</strong><p className="wb-muted">{desc}</p></Button>)}</div></div> : type === "source" ? <SourcePanel api={api} project={project} design={designs.find((d) => d.id === modal.designId) || design} provider={modal.provider} onOpenReplica={(page,created)=>{close();onOpenReplica(page,created);}} legacy={legacy} t={t} mutate={mutate} onReference={onReference} /> : type === "runtime" ? <RuntimePanel api={api} project={project} mutate={mutate} onStatus={onStatus} onOpenFile={onOpenFile} onOpenRuntime={(r) => onOpenContent("runPreview", { ...r, resourceId: r.id })} /> : type === "delivery" ? <DeliveryPanel api={api} project={project} design={design} pages={pages} onChanged={async()=>{await mutate('workspace.open',{},true);await refreshLibrary();}} /> : type === "diagnostics" ? <div className="wb-stack"><p className="wb-muted">保存、结构校验、预览刷新和运行服务分别记录。</p>{diagnostics.length ? diagnostics.map((d, i) => <div key={i} className="wb-message"><strong>{d.severity || "info"} · {d.code || ""}</strong><p>{d.message || JSON.stringify(d)}</p>{d.nodeId && <Button onClick={() => onReference({ type: "node", pageId: d.pageId, nodeIds: [d.nodeId], label: d.message })}>引用问题元素</Button>}</div>) : <p>暂无诊断。</p>}</div> : type === "history" ? <div className="wb-stack"><p className="wb-muted">设计历史独立于 Git。恢复前先保存当前版本。</p>{(project?.history || []).map((h) => <article className="wb-message" key={h.id}><div className="wb-row"><strong className="wb-grow">{h.summary || "\u7248\u672C " + h.revision}</strong><small>{new Date(h.createdAt).toLocaleString()}</small><Button onClick={() => work(async () => {
    const r = await api("snapshot.get", { projectId: project.id, snapshotId: h.id });
    setResult(r);
  })}>查看内容</Button><Button onClick={() => setPreview(h)}>恢复…</Button></div></article>)}{preview && <div className="wb-stack"><p>将恢复“{preview.summary || preview.id}”。当前设计会先留下恢复点。</p><Button primary onClick={() => work(async () => {
    await mutate("snapshot.restore", { snapshotId: preview.id });
    setPreview(null);
  })}>确认恢复此版本</Button><Button onClick={() => setPreview(null)}>取消</Button></div>}{result && <pre>{JSON.stringify(result, null, 2)}</pre>}</div> : type === "binding" ? <div className="wb-form"><p className="wb-muted">修改绑定仅影响后续请求，不自动改写已有页面。后续生成使用所选规范最近保存的内容。</p><label>作用对象<select value={values.bindingScope || "design"} onChange={(e) => {
    const scope = e.target.value;
    setValues((v) => ({ ...v, bindingScope: scope, bindingMode: scope === "project" ? "independent" : design?.binding?.mode || "inherit", systemId: scope === "project" ? project.systemId || "" : design?.binding?.systemId || project.systemId || "" }));
    setPreview(null);
  }}><option value="design">当前设计 · {design?.name}</option><option value="project">项目默认 · {project.name}</option></select></label>{values.bindingScope!=='project'&&<label>继承方式<select value={values.bindingMode} onChange={(e) => update("bindingMode", e.target.value)}><option value="inherit">继承项目默认体系</option><option value="independent">独立绑定</option><option value="none">不绑定体系</option></select></label>}{(values.bindingScope==='project'||values.bindingMode==='independent')&&systemSelect}<Button onClick={() => work(async () => setPreview(await api("binding.preview", bindingArgs())))}>预览影响与平台差异</Button>{preview && <><div>{preview.affected.length ? preview.affected.map(row => <p key={row.designId}>{row.name} · {row.after.system?.name || '未绑定'}{row.platformDifference ? '（平台不匹配）' : ''}</p>) : '当前设计绑定无变化'}</div><Button primary onClick={() => work(async () => {
    await mutate("binding.set", bindingArgs());
    close();
  })}>确认更改绑定</Button></>}<Button onClick={() => work(async () => setResult(await api("binding.resolve", { projectId: project.id, designId: design?.id })))}>查看当前设计规范</Button><BindingApplication project={project} design={design} pages={pages} selection={selection} api={api} mutate={mutate}/>{result && <p>{result.system?.name || '未绑定'}</p>}</div> : <form onSubmit={submit} className="wb-form">{type === "project" ? <>{field("\u9879\u76EE\u540D\u79F0", "name", false, true)}{field("\u63CF\u8FF0", "description", true)}{!values.projectId && <><div className="wb-row"><label className="wb-grow">保存父目录<input value={values.saveLocation || ""} onChange={(e) => update("saveLocation", e.target.value)} placeholder={library.root || "\u9ED8\u8BA4\u8BBE\u8BA1\u5E93"} /></label><Button onClick={() => work(async () => {
    const directory = await ctx.uiWorkspace.pickDirectory();
    if (directory) update("saveLocation", directory);
  })}>选择目录</Button></div><p className="wb-muted">在所选目录下新建项目文件夹，保留现有文件。留空使用当前设计库。</p>{field("\u4E1A\u52A1\u76EE\u6807", "goal", true)}<label>起点<select value={values.startKind || "empty"} onChange={(e) => update("startKind", e.target.value)}>{[["empty", "\u7A7A\u9879\u76EE"], ["website", "\u7F51\u7AD9"], ["mastergo", "MasterGo"], ["figma", "Figma"], ["source", "\u5DF2\u6709\u6E90\u7801"]].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>{values.startKind === "source" ? field("\u6E90\u7801\u76EE\u5F55\uFF08\u767B\u8BB0\u73B0\u6709\u76EE\u5F55\uFF09", "path") : values.startKind && values.startKind !== "empty" ? field("\u6765\u6E90\u94FE\u63A5\uFF08\u53EF\u7A0D\u540E\u914D\u7F6E\uFF09", "url") : null}{systemSelect}</>}<label>分组<select value={values.groupId || ""} onChange={(e) => update("groupId", e.target.value)}><option value="">未分组</option>{library.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{values.projectId && <><Button onClick={() => work(async () => {
    await mutate("project.clone", { projectId: values.projectId, name: values.name + " \u526F\u672C" });
    close();
  })}>复制项目</Button><Button onClick={() => work(async () => {
    const latest = onBeforeProjectExit ? await onBeforeProjectExit() : true;
    if (!latest) return;
    await mutate("project.archive", { projectId: values.projectId, expectedRevision: latest?.id === values.projectId ? latest.revision : values.revision }, false);
    onProjectUnavailable?.(values.projectId);
    close();
  })}>归档项目</Button><Button onClick={() => setPreview({ deleteProject: true })}>移入回收站…</Button>{preview?.deleteProject && <div className="wb-stack"><p>项目文件和设计历史会保留，可以从回收站恢复。</p><Button onClick={() => work(async () => {
    const latest = onBeforeProjectExit ? await onBeforeProjectExit() : true;
    if (!latest) return;
    await mutate("project.delete", { projectId: values.projectId, expectedRevision: latest?.id === values.projectId ? latest.revision : values.revision }, false);
    onProjectUnavailable?.(values.projectId);
    close();
  })}>确认移入回收站</Button></div>}</>}</> : type === "group" ? <>{field("\u5206\u7EC4\u540D\u79F0", "name", false, true)}{values.id && <Button onClick={() => work(async () => {
    await api("group.delete", { groupId: values.id, expectedRevision: values.revision });
    await refreshLibrary();
    close();
  })}>删除分组，保留其中项目</Button>}</> : type === "design" ? <>{field("\u8BBE\u8BA1\u540D\u79F0", "name", false, true)}{!values.designId && <><label>设计起点<select value={values.sourceKind} onChange={(e) => update("sourceKind", e.target.value)}>{[["requirements", "\u9700\u6C42\u751F\u6210"], ["website", "\u7F51\u7AD9\u590D\u523B"], ["mastergo", "MasterGo \u8FD8\u539F"], ["figma", "Figma \u8FD8\u539F"]].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>{values.sourceKind !== "requirements" && field("\u6765\u6E90\u94FE\u63A5\uFF08\u53EF\u7A0D\u540E\u8BBE\u7F6E\uFF09", "url")}<p className="wb-muted">默认忠实还原。按设计体系改版需另行明确选择，不会隐式应用。</p></>}{values.designId && <><Button onClick={() => work(async () => {
    await mutate("design.clone", { designId: values.designId, name: values.name + " \u526F\u672C" });
    close();
  })}>复制设计（含资源）</Button><Button onClick={() => setPreview({ deleteDesign: true })}>删除设计…</Button>{preview?.deleteDesign && <Button onClick={() => work(async () => {
    await mutate("design.delete", { designId: values.designId });
    close();
  })}>确认移除设计登记</Button>}</>}</> : type === "page" ? <>{field("\u9875\u9762\u540D\u79F0", "name", false, !values.page)}{field("\u5BBD\u5EA6", "width")}{field("\u9AD8\u5EA6", "height")}{values.page && <><Button onClick={() => work(async () => {
    await mutate("page.clone", { pageId: values.page.id, designId: values.designId, targetDesignId: values.targetDesignId || values.designId, name: (values.name || values.page.name) + " \u526F\u672C" });
    close();
  })}>复制页面和依赖资源</Button><label>复制到设计<select value={values.targetDesignId || values.designId} onChange={(e) => update("targetDesignId", e.target.value)}>{designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><Button onClick={() => setPreview({ deletePage: true })}>移除页面…</Button>{preview?.deletePage && <Button onClick={() => work(async () => {
    await mutate("page.delete", { pageId: values.page.id, designId: values.designId });
    close();
  })}>确认移除页面</Button>}</>}</> : type === "file" ? <><label>操作<select value={values.fileAction || "create"} onChange={(e) => update("fileAction", e.target.value)}>{[["asset", "\u5BFC\u5165 / \u66FF\u6362\u8D44\u6E90"], ["create", "\u65B0\u5EFA\u6587\u4EF6"], ["rename", "\u91CD\u547D\u540D"], ["move", "\u79FB\u52A8"], ["copy", "\u590D\u5236"], ["remove", "\u79FB\u9664\u767B\u8BB0"]].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>{field("\u9879\u76EE\u5185\u8DEF\u5F84", "path", false, true)}{(!values.fileAction || values.fileAction === "create") && field("\u521D\u59CB\u5185\u5BB9", "content", true)}{values.fileAction === "rename" && field("\u65B0\u540D\u79F0", "newName", false, true)}{["move", "copy"].includes(values.fileAction) && field("\u76EE\u6807\u8DEF\u5F84", "destination", false, true)}{values.fileAction === "remove" && <label className="wb-row"><input type="checkbox" checked={!!values.deleteFiles} onChange={(e) => update("deleteFiles", e.target.checked)} />实际删除文件（默认仅移除登记）</label>}<label>导入资源<input type="file" onChange={(e) => upload(e.target.files[0])} /></label><label className="wb-row"><input type="checkbox" checked={!!values.replace} onChange={(e) => update("replace", e.target.checked)} />替换已有资源（填写路径）</label>{result && <pre>{JSON.stringify(result, null, 2)}</pre>}</> : null}<footer><Button onClick={close} disabled={busy}>取消</Button><Button primary type="submit" disabled={busy}>{busy ? "\u6B63\u5728\u5904\u7406\u2026" : values.id || values.projectId || values.designId || values.page ? "\u4FDD\u5B58" : "\u521B\u5EFA"}</Button></footer></form>}</Modal>;
}
export {
  WorkbenchDialogs as default
};
