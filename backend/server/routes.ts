import type { Express } from "express";
import { type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";

function startPythonBackend() {
  const isWindows = process.platform === "win32";
  const pythonExe = isWindows ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
  const pythonProcess = spawn(pythonExe, ["-m", "uvicorn", "server_py.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  pythonProcess.on("error", (err) => {
    console.error("Failed to start Python backend:", err.message);
  });

  pythonProcess.on("exit", (code) => {
    console.error(`Python backend exited with code ${code}, restarting in 3s...`);
    setTimeout(startPythonBackend, 3000);
  });

  return pythonProcess;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startPythonBackend();

  app.use(
    createProxyMiddleware({
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      pathFilter: ["/api/**", "/uploads/**"],
      onError: (err, req, res) => {
        console.error("Proxy error:", err.message);
        if (res && "writeHead" in res) {
          (res as any).writeHead(502, { "Content-Type": "application/json" });
          (res as any).end(JSON.stringify({ error: "Python backend unavailable" }));
        }
      },
    })
  );

  return httpServer;
}
