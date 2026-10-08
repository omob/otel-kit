const { Worker } = require("node:worker_threads");

new Worker("setTimeout(() => {}, 100)", { eval: true }).on("exit", () => process.exit(0));
