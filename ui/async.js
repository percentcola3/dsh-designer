export function createLimiter(maximum = 4) {
  let active = 0;
  const waiting = [];
  const drain = () => { while (active < maximum && waiting.length) { const task = waiting.shift(); active++; Promise.resolve().then(task.run).then(task.resolve,task.reject).finally(() => { active--; drain(); }); } };
  return run => new Promise((resolve,reject) => { waiting.push({run,resolve,reject}); drain(); });
}
export async function mapInBatches(items, mapper, size = 4) {
  const result = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(...await Promise.all(items.slice(offset, offset + size).map((item,index) => mapper(item,offset+index))));
  }
  return result;
}
