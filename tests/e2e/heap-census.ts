import type { CDPSession } from "@playwright/test";

export async function liveInstances(cdp: CDPSession, constructorName: string, where = "true"): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { result: prototype } = await cdp.send("Runtime.evaluate", { expression: `${constructorName}.prototype` });
  const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.objectId! });
  const { result: count } = await cdp.send("Runtime.callFunctionOn", {
    objectId: objects.objectId!,
    functionDeclaration: `function () { return this.filter((item) => ${where}).length; }`,
    returnByValue: true,
  });
  await cdp.send("Runtime.releaseObject", { objectId: objects.objectId! });
  await cdp.send("Runtime.releaseObject", { objectId: prototype.objectId! });
  return count.value as number;
}
