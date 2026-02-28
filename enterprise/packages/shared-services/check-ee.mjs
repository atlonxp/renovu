// Enterprise build check - stub for self-hosted
import { existsSync } from "fs";
import { execSync } from "child_process";

const srcDir = new URL("./src", import.meta.url).pathname;
if (existsSync(srcDir)) {
  execSync("npm run build:main", { stdio: "inherit" });
} else {
  console.log("EE source not available, skipping build");
  // Create empty build output
  import("fs").then(fs => {
    fs.mkdirSync(new URL("./build/main", import.meta.url).pathname, { recursive: true });
    fs.writeFileSync(new URL("./build/main/index.js", import.meta.url).pathname, "module.exports = {};");
    fs.writeFileSync(new URL("./build/main/index.d.ts", import.meta.url).pathname, "export {};");
  });
}
