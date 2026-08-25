import { diagnoseBrowsers } from "./audit.mjs";

const results = await diagnoseBrowsers();
process.stdout.write(`${JSON.stringify({ browsers: results }, null, 2)}\n`);

if (!results.some((result) => result.available)) process.exitCode = 1;
