import defaultState from "../../features/northstar/default-state.json";

// Published copy of the embedded blueprint, served from the same source file.
export function GET() {
  return new Response(JSON.stringify(defaultState, null, 2) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
