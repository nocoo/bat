#!/usr/bin/env bun
// Uptime Kuma Socket.IO client template.
//
// HOW TO USE: Copy this file to /tmp/uk-task.mjs, add your operations in the
// marked section below, then run:
//   cd <project-root> && bun run /tmp/uk-task.mjs
//
// Prerequisite: socket.io-client must be installed at project root or globally.
//   bun add socket.io-client    (if not already available)

import { io } from "socket.io-client";

const config = JSON.parse(await Bun.file("skills/uptime-kuma/config.json").text());

const socket = io(config.base_url, { transports: ["websocket"] });

let monitorList = {};
socket.on("monitorList", (data) => { monitorList = data; });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const emit = (event, ...args) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), 10000);
  socket.emit(event, ...args, (res) => { clearTimeout(timer); resolve(res); });
});

try {
  const loginRes = await emit("login", {
    username: config.username,
    password: config.password,
    token: "",
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginRes)}`);
  await sleep(2000); // monitorList arrives via event ~1-2s after login

  // --- YOUR OPERATIONS BELOW ---
  // Available: socket, monitorList, emit, sleep, config
  //
  // Examples:
  //   List monitors:     console.log(monitorList);
  //   Add monitor:       await emit("add", { type, name, url, ... conditions: [] });
  //   Edit monitor:      await emit("editMonitor", { id, type, name, url, ... conditions: [] });
  //   Delete monitor:    await emit("deleteMonitor", monitorId);
  //   Pause/Resume:      await emit("pauseMonitor", id); / await emit("resumeMonitor", id);
  //   Get heartbeats:    await emit("getMonitorBeats", monitorId, hours);

  console.log("Connected. Monitors:", Object.keys(monitorList).length);
  for (const [id, m] of Object.entries(monitorList)) {
    console.log(`  [${id}] ${m.name} (${m.type}) parent=${m.parent || "—"}`);
  }

} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
} finally {
  socket.disconnect();
  process.exit(0);
}
