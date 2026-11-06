// bat workstation — monitor this machine with an isolated profile.

import { defineCommand } from "@nocoo/base-cli";
import workstationLogin from "./login.js";
import workstationLogout from "./logout.js";
import workstationProbe from "./probe.js";
import workstationSetup from "./setup.js";
import workstationStatus from "./status.js";

export default defineCommand({
	meta: {
		name: "workstation",
		description: "Monitor this workstation (login, setup, probe, status, logout)",
	},
	subCommands: {
		login: workstationLogin,
		setup: workstationSetup,
		probe: workstationProbe,
		status: workstationStatus,
		logout: workstationLogout,
	},
});
