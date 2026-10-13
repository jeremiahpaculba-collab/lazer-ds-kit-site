// Live status for the docs Status page.
// Reads every Status Tag instance in the Figma kit through the Figma REST API and returns
// { updated, statuses: { "<tag node id>": "WIP" | "In review" | "Ready for dev" | "Final" } }.
// Needs one environment variable in Vercel: FIGMA_TOKEN (a Figma personal access token with
// the file_content:read scope). The token stays on the server and is never sent to the page.
// Results are cached at the edge for 5 minutes so Figma is asked at most a few times an hour.

const FILE_KEY = process.env.FIGMA_FILE_KEY || "JImp972lwOgzmFtQyC2PO2";
const TAGS = require("./_status-tags.json"); // [ "1157:62207", ... ] in Status page row order
const VARIANTS = {
  "1157:62154": "WIP",
  "1157:62157": "In review",
  "1157:62160": "Ready for dev",
  "1157:62163": "Final",
};
const ALLOWED = new Set(Object.values(VARIANTS));

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "not_configured" }));
  }
  try {
    const url = `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(TAGS.join(","))}&depth=1`;
    const r = await fetch(url, { headers: { "X-Figma-Token": token } });
    if (!r.ok) throw new Error("figma_" + r.status);
    const data = await r.json();
    const statuses = {};
    for (const id of TAGS) {
      const doc = data.nodes && data.nodes[id] && data.nodes[id].document;
      if (!doc) continue; // tag deleted or moved: the page keeps its snapshot value
      let s = VARIANTS[doc.componentId];
      const prop = doc.componentProperties && doc.componentProperties.Status;
      if (!s && prop && ALLOWED.has(prop.value)) s = prop.value;
      if (s) statuses[id] = s;
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.statusCode = 200;
    return res.end(JSON.stringify({ updated: new Date().toISOString(), statuses }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: String((e && e.message) || "failed") }));
  }
};
