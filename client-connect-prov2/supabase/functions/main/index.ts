import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FUNCTIONS_DIR = "/home/deno/functions";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const functionName = pathParts[0];

  if (!functionName || functionName === "main") {
    return new Response(
      JSON.stringify({ message: "GestãoPro Edge Functions running" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const servicePath = `${FUNCTIONS_DIR}/${functionName}`;

    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    });

    return await worker.fetch(req);
  } catch (e) {
    console.error(`[main] Error in function '${functionName}':`, e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
