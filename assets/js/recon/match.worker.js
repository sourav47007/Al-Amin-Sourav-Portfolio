// match.worker.js — runs the engine off the main thread. Module worker.
import { reconcile, ageing } from "./match.js";

self.onmessage = e => {
  const { A, B, options, asOf } = e.data;
  try {
    const res = reconcile(A, B, options, p => self.postMessage({ type: "progress", ...p }));
    res.ageing = ageing(res.unmatchedA, asOf);
    self.postMessage({ type: "result", result: res });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
};
