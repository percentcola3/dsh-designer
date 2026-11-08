import React from "react";
import { Button, ErrorBox, errorValue } from "./common.jsx";
import { freezeRuntimeAction } from "./runtime-confirmation.js";
import FileNavigation from './FileNavigation.jsx';
function RuntimePanel({ api, project, mutate, onStatus, onOpenRuntime, onOpenFile,viewState={},onViewState }) {
  const [sources, setSources] = React.useState([]), [sourceId, setSourceId] = React.useState(viewState.sourceId||''), [directory, setDirectory] = React.useState(""), [name, setName] = React.useState(""), [command, setCommand] = React.useState(""), [port, setPort] = React.useState(""), [url, setURL] = React.useState(""), [run, setRun] = React.useState(null), [logs, setLogs] = React.useState({ stdout: "", stderr: "" }), [git, setGit] = React.useState(null), [diff, setDiff] = React.useState(null), [branches, setBranches] = React.useState(null), [paths, setPaths] = React.useState([]), [message, setMessage] = React.useState(""), [branch, setBranch] = React.useState(""), [remote, setRemote] = React.useState("origin"), [error, setError] = React.useState(null), [result, setResult] = React.useState(null), [busy, setBusy] = React.useState(false), [confirmation, setConfirmation] = React.useState(null), [writable, setWritable] = React.useState(false), [writablePaths, setWritablePaths] = React.useState(""), [tree, setTree] = React.useState([]), [treePath, setTreePath] = React.useState(""), [generatedFile, setGeneratedFile] = React.useState(""), [mapLine, setMapLine] = React.useState(1), [mapColumn, setMapColumn] = React.useState(0), [mapping, setMapping] = React.useState(null);
  const [treeLoaded,setTreeLoaded]=React.useState(false),[treeRoot,setTreeRoot]=React.useState('');
  const owner=React.useRef({projectId:project.id,sourceId}),operations=React.useRef(0);owner.current={projectId:project.id,sourceId};
  const offsets = React.useRef({ stdoutOffset: 0, stderrOffset: 0 });
  const loadTree=async(path)=>{const r=await work('file.tree',{path});if(r){setTree((r.files||[]).map(file=>({...file,sourceId:r.sourceId||sourceId})));setTreeRoot(path);setTreeLoaded(true);onViewState?.({...viewState,sourceId,sourceTrees:{...viewState.sourceTrees,[sourceId]:{...viewState.sourceTrees?.[sourceId],path}}});}};
  const confirm = (value) => setConfirmation(freezeRuntimeAction(value, { projectId: project.id, sourceId, sourceName: sources.find((source) => source.id === sourceId)?.name, head: git?.head || git?.commit }));
  const work = async (action, args = {}) => {
    const submitted={projectId:project.id,sourceId,...args},current=()=>owner.current.projectId===submitted.projectId&&(action==='runtime.list'||owner.current.sourceId===submitted.sourceId);
    operations.current++;setBusy(true);
    setError(null);
    try {
      const r = await api(action, submitted);
      if(!current())return;
      setResult(r);
      return r;
    } catch (e) {
      if(current())setError(e);
    } finally {
      operations.current--;setBusy(operations.current>0);
    }
  };
  const refresh = async () => {
    const r = await work("runtime.list");
    if (r) {
      setSources(r.sources || []);
      if(!sourceId&&r.sources?.length)setSourceId(r.sources[0].id);
      else if(sourceId&&!r.sources?.some(source=>source.id===sourceId))setSourceId('');
    }
  };
  React.useEffect(() => {
    refresh();
  }, [project.id]);
  React.useEffect(() => {
    setConfirmation(null);
    offsets.current = { stdoutOffset: 0, stderrOffset: 0 };
    setLogs({ stdout: "", stderr: "" });
    setGit(null);
    setDiff(null);
    setBranches(null);
    setPaths([]);
    const s = sources.find((s2) => s2.id === sourceId);
    setName(s?.name || "");
    setDirectory(s?.directory || s?.root || "");
    setCommand(s?.command || "");
    setPort(s?.port || "");
    setURL(s?.url || "");
    setRun(s?.run || null);
    setWritable(s?.writable === true || s?.readonly === false);
    setWritablePaths((s?.writablePaths || []).join("\n"));
    setTree([]);setTreeLoaded(false);setMapping(null);setGeneratedFile('');
    setTreePath(viewState.sourceTrees?.[sourceId]?.path||'');
  }, [sourceId]);
  const readStatus = async () => {
    const r = await work("runtime.status");
    if (r) {
      setRun(r.run || r.source?.run);
      onStatus?.((s) => ({ ...s, runtime: r.run?.status || r.source?.run?.status || "已登记" }));
    }
  };
  const readLogs = async () => {
    const r = await work("runtime.logs", offsets.current);
    if (r) {
      setLogs((l) => ({ stdout: l.stdout + (r.stdout?.text || ""), stderr: l.stderr + (r.stderr?.text || "") }));
      offsets.current = { stdoutOffset: r.stdout?.nextOffset || 0, stderrOffset: r.stderr?.nextOffset || 0 };
    }
  };
  const gitAction = async (action) => {
    const r = await work("git." + action, { paths: paths.length ? paths : void 0 });
    if (!r) return;
    if (action === "status") setGit(r);
    if (action === "diff") setDiff(r);
    if (action === "branches") setBranches(r);
  };
  const gitFiles = git?.files || git?.changes || git?.status?.files || [];
  const executeConfirmed = async () => {
    const c = confirmation;
    if (!c) return;
    if (c.projectId !== project.id || c.sourceId !== sourceId) {
      setConfirmation(null);
      setError(errorValue("源码目标已切换，请在当前源码重新确认操作。", "SOURCE_CHANGED"));
      return;
    }
    const r = await work(c.action, c.args);
    if (r) {
      setConfirmation(null);
      if (c.action.startsWith("git.")) await gitAction("status");
      else if (c.action === "runtime.start") {
        setRun(r.run || r.source?.run);
        onStatus?.((s) => ({ ...s, runtime: r.run?.status || "running" }));
      } else if (c.action === "runtime.unregister") {
        setSourceId("");
        await refresh();
      }
    }
  };
  return <div className="wb-stack"><p className="wb-muted">登记外部源码，不移动原目录。命令启动、Git 写入和同步由你明确触发。</p><div className="wb-row"><label className="wb-grow">已登记源码<select value={sourceId} disabled={busy} onChange={(e) => {
    setConfirmation(null);
    setSourceId(e.target.value);onViewState?.({...viewState,sourceId:e.target.value});
  }}><option value="">新登记…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.directory || s.root}</option>)}</select></label><Button onClick={refresh} disabled={busy}>刷新登记</Button></div><div className="wb-operation-grid"><label>名称<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>真实目录<input value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="当前会话允许访问的源码目录" /></label><label>启动命令<input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="例如 pnpm dev" /></label><label>端口<input type="number" value={port} onChange={(e) => setPort(e.target.value)} /></label><label>运行预览地址<input type="url" value={url} onChange={(e) => setURL(e.target.value)} placeholder="http://127.0.0.1:…" /></label></div><label className="wb-row"><input type="checkbox" checked={writable} onChange={(e) => setWritable(e.target.checked)} />允许编辑器和 AI 在登记范围内修改源码（默认只读）</label><p className="wb-muted">命令和 Git 写入独立确认，并继续遵守当前 DSH 会话权限。</p>{writable && <label>允许写入的相对目录（每行一个，留空为登记目录）<textarea rows={2} value={writablePaths} onChange={(e) => setWritablePaths(e.target.value)} /></label>}<div className="wb-row"><Button disabled={busy || !directory} primary onClick={async () => {
    try {
      const r = await mutate(sourceId ? "runtime.update" : "runtime.register", { sourceId: sourceId || void 0, directory, name, command, port: port ? Number(port) : void 0, url: url || void 0, readonly: !writable, writable, writablePaths: writablePaths.split("\n").map((s) => s.trim()).filter(Boolean) });
      if (r?.source) {
        setSources((s) => [...s.filter((v) => v.id !== r.source.id), r.source]);
        setSourceId(r.source.id);
      }
    } catch (e) {
      setError(e);
    }
  }}>{sourceId ? "保存源码配置" : "登记目录"}</Button>{sourceId && <><Button disabled={busy} onClick={() => confirm({ action: "runtime.start", args: { command, port: port ? Number(port) : void 0, url: url || void 0 }, description: `启动命令：${command || "(使用登记命令)"}` })}>启动服务…</Button><Button disabled={busy} onClick={async () => {
    const r = await work("runtime.stop");
    if (r) {
      setRun(r.run || { status: "stopped" });
      onStatus?.((s) => ({ ...s, runtime: "已停止" }));
    }
  }}>停止服务</Button><Button disabled={busy} onClick={readStatus}>状态</Button><Button disabled={busy} onClick={readLogs}>读取日志</Button><Button disabled={busy} onClick={() => confirm({ action: "runtime.unregister", args: { expectedRevision: project.revision }, description: "仅移除源码登记，保留原目录。使用中的服务需先停止。" })}>移除登记…</Button></>}</div><ErrorBox error={error} />{sourceId && <><div className="wb-row"><span className="wb-chip">服务 · {run?.status || "未启动"}</span><span className="wb-muted">{run?.pid ? "PID " + run.pid : ""} {sources.find((s) => s.id === sourceId)?.referenceOnly ? "尚无可靠对象映射，作为参考使用" : ""}</span>{(run?.url || url) && <>{onOpenRuntime && <Button onClick={() => onOpenRuntime({ id: sourceId, name: name || "运行预览", url: run?.url || url })}>打开运行标签</Button>}<a href={run?.url || url} target="_blank" rel="noopener noreferrer">外部打开 ↗</a></>}</div><section className="wb-stack"><div className="wb-row"><label className="wb-grow">源码相对目录<input value={treePath} onChange={(e) => setTreePath(e.target.value)} /></label><Button onClick={async () => {
    await loadTree(treePath);
  }}>浏览源码文件</Button></div>{treeLoaded&&<FileNavigation key={project.id+':'+sourceId+':'+treeRoot} files={tree} viewState={viewState.sourceTrees?.[sourceId]?.views?.[treeRoot]} onViewState={navigation=>onViewState?.({...viewState,sourceTrees:{...viewState.sourceTrees,[sourceId]:{...viewState.sourceTrees?.[sourceId],views:{...viewState.sourceTrees?.[sourceId]?.views,[treeRoot]:navigation}}}})} onOpen={(file,keep)=>onOpenFile?.({...file,sourceId,id:file.fileId||file.id},keep)}/>}<details><summary>运行位置映射到源码</summary><div className="wb-stack"><label>生成文件路径<input value={generatedFile} onChange={(e) => setGeneratedFile(e.target.value)} /></label><div className="wb-row"><label>行<input type="number" min={1} value={mapLine} onChange={(e) => setMapLine(Number(e.target.value))} /></label><label>列<input type="number" min={0} value={mapColumn} onChange={(e) => setMapColumn(Number(e.target.value))} /></label><Button disabled={!generatedFile || busy} onClick={async () => {
    const r = await work("runtime.map", { generatedFile, line: mapLine, column: mapColumn });
    if (r) setMapping(r);
  }}>查找可靠映射</Button></div>{mapping && <><p className="wb-muted">{mapping.mode === "source" ? `${mapping.path}:${mapping.line}:${mapping.column}` : `仅作参考 · ${mapping.reason}`}</p>{mapping.mode === "source" && <Button onClick={() => onOpenFile?.({ sourceId, path: mapping.path, name: mapping.path.split("/").pop(), view: { line: mapping.line, column: mapping.column } }, true)}>定位真实源码</Button>}</>}</div></details></section><details open={!!logs.stdout || !!logs.stderr}><summary>stdout / stderr 日志</summary><div className="wb-operation-grid"><div><h3>stdout</h3><pre className="wb-runtime-log">{logs.stdout || "暂无输出"}</pre></div><div><h3>stderr</h3><pre className="wb-runtime-log">{logs.stderr || "暂无错误输出"}</pre></div></div></details><section className="wb-stack" style={{ borderTop: "1px solid var(--wb-border)", paddingTop: 14 }}><div className="wb-row"><h3 className="wb-grow">Git</h3><Button disabled={busy} onClick={() => gitAction("status")}>状态</Button><Button disabled={busy} onClick={() => gitAction("diff")}>查看差异</Button><Button disabled={busy} onClick={() => gitAction("branches")}>分支</Button></div>{git && <><p className="wb-muted">当前分支 {git.branch || git.currentBranch || "—"} · HEAD {git.head || git.commit || "—"}</p>{gitFiles.length ? gitFiles.map((file, i) => {
    const path = typeof file === "string" ? file : file.path || file.name;
    return <label className="wb-row" key={path || i}><input type="checkbox" checked={paths.includes(path)} onChange={(e) => setPaths((s) => e.target.checked ? [...s, path] : s.filter((p) => p !== path))} /><span>{typeof file === "object" ? file.status || file.code || `${file.index || ""}${file.worktree || ""}` : ""} {path}</span></label>;
  }) : <pre>{JSON.stringify(git, null, 2)}</pre>}<label>提交说明<input value={message} onChange={(e) => setMessage(e.target.value)} /></label><Button disabled={busy || !paths.length || !message.trim()} onClick={() => confirm({ action: "git.commit", args: { paths, message }, description: `仅提交你勾选的 ${paths.length} 个文件：${paths.join(", ")}` })}>提交所选文件…</Button></>}{diff && <pre className="wb-runtime-log">{typeof diff === "string" ? diff : diff.diff || diff.text || JSON.stringify(diff, null, 2)}</pre>}{branches && <pre>{JSON.stringify(branches, null, 2)}</pre>}<div className="wb-operation-grid"><label>目标分支<input value={branch} onChange={(e) => setBranch(e.target.value)} /></label><label>远端<input value={remote} onChange={(e) => setRemote(e.target.value)} /></label></div><div className="wb-row"><Button disabled={busy || !branch} onClick={() => confirm({ action: "git.checkout", args: { branch }, description: `切换到分支 ${branch}。未保存和冲突将由后端拒绝并提示。` })}>切换分支…</Button><Button disabled={busy} onClick={() => confirm({ action: "git.pull", args: { remote, branch: branch || void 0 }, description: `从 ${remote}/${branch || "当前分支"} 拉取更改。` })}>主动 Pull…</Button><Button disabled={busy} onClick={() => confirm({ action: "git.push", args: { remote, branch: branch || void 0 }, description: `向 ${remote}/${branch || "当前分支"} 推送提交。` })}>主动 Push…</Button></div></section></>}{confirmation && <div className="wb-stack wb-message"><strong>确认执行 {confirmation.action}</strong><p>源码 · {confirmation.sourceName}</p><p>{confirmation.description}</p><div className="wb-row"><Button primary disabled={busy} onClick={executeConfirmed}>确认执行</Button><Button disabled={busy} onClick={() => setConfirmation(null)}>取消</Button></div></div>}{result && <details><summary>业务操作结果</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}</div>;
}
export {
  RuntimePanel as default
};
